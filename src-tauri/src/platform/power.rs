//! System sleep and screen lock (spec 6.3 and 8).
//!
//! macOS: `NSWorkspaceWillSleepNotification` records the true sleep moment (and writes a tracker
//! heartbeat, so a crash during sleep is reconciled at the sleep time), and the distributed
//! `com.apple.screenIsLocked` / `com.apple.screenIsUnlocked` notifications mark a lock.
//! The absence monitor (`absence.rs`) stays the single producer of absences; it reads this state:
//! - `refine_sleep_at`: the sleep moment, instead of the last 5 s tick before the wall-clock gap;
//! - `lock_adjusted`: while locked, idle counts from the lock moment (typing the password does not
//!   end it) and a lock longer than `LOCK_MIN_MS` is an absence even under the idle threshold.
//!
//! Windows: not wired. Sleep is caught by the monotonic-clock gap in `absence.rs` and a lock by the
//! idle time; `WM_POWERBROADCAST` / `WTS_SESSION_LOCK` would need a hidden message window.

use std::sync::atomic::{AtomicI64, Ordering};

use tauri::AppHandle;

use crate::domain::Ms;

/// A lock this long is an absence even when shorter than the idle threshold (accidental locks
/// and a quick unlock are ignored).
pub const LOCK_MIN_MS: i64 = 60_000;

/// 0 = none.
static WILL_SLEEP_AT: AtomicI64 = AtomicI64::new(0);
static LOCKED_AT: AtomicI64 = AtomicI64::new(0);

fn load(a: &AtomicI64) -> Option<Ms> {
    Some(a.load(Ordering::SeqCst)).filter(|&v| v != 0)
}

pub fn note_will_sleep(at: Ms) {
    WILL_SLEEP_AT.store(at, Ordering::SeqCst);
}

pub fn note_screen_locked(at: Ms) {
    // Keep the first lock moment if notifications repeat.
    let _ = LOCKED_AT.compare_exchange(0, at, Ordering::SeqCst, Ordering::SeqCst);
}

pub fn note_screen_unlocked() {
    LOCKED_AT.store(0, Ordering::SeqCst);
}

/// Pure: the recorded will-sleep moment when it falls inside the detected gap, else the tick.
pub fn pick_sleep_at(tick_at: Ms, wake: Ms, will_sleep: Option<Ms>) -> Ms {
    will_sleep
        .filter(|&s| s >= tick_at && s <= wake)
        .unwrap_or(tick_at)
}

/// The sleep moment for a sleep gap detected between `tick_at` (last tick) and `wake`.
/// Consumes the recorded will-sleep time.
pub fn refine_sleep_at(tick_at: Ms, wake: Ms) -> Ms {
    let recorded = Some(WILL_SLEEP_AT.swap(0, Ordering::SeqCst)).filter(|&v| v != 0);
    pick_sleep_at(tick_at, wake, recorded)
}

/// Pure: `(idle_ms, threshold_ms)` as the absence monitor should see them.
pub fn adjust_for_lock(
    idle_ms: i64,
    threshold_ms: i64,
    now: Ms,
    locked_at: Option<Ms>,
) -> (i64, i64) {
    match locked_at {
        Some(at) if now >= at => (idle_ms.max(now - at), threshold_ms.min(LOCK_MIN_MS)),
        _ => (idle_ms, threshold_ms),
    }
}

/// `adjust_for_lock` with the current lock state.
pub fn lock_adjusted(idle_ms: i64, threshold_ms: i64, now: Ms) -> (i64, i64) {
    adjust_for_lock(idle_ms, threshold_ms, now, load(&LOCKED_AT))
}

/// Subscribes to the OS notifications (macOS). Call once from the main thread (setup).
pub fn start(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    macos::observe(app.clone());
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2_app_kit::{NSWorkspace, NSWorkspaceWillSleepNotification};
    use objc2_foundation::{
        NSDistributedNotificationCenter, NSNotification, NSNotificationCenter, NSOperationQueue,
        NSString,
    };
    use tauri::{AppHandle, Manager};

    use crate::commands::{now_ms, AppState};

    fn observe_on(center: &NSNotificationCenter, name: &NSString, f: impl Fn() + 'static) {
        let block = RcBlock::new(move |_n: NonNull<NSNotification>| f());
        let queue = NSOperationQueue::mainQueue();
        // SAFETY: no sender filter; the block only touches Send + Sync app state and runs on the
        // main queue. The center keeps the registration for the app's lifetime.
        let token = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(name),
                None,
                Some(&queue),
                &block,
            )
        };
        std::mem::forget(token);
    }

    pub fn observe(app: AppHandle) {
        let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
        // SAFETY: AppKit-provided constant.
        let will_sleep = unsafe { NSWorkspaceWillSleepNotification };
        observe_on(&workspace, will_sleep, move || {
            let now = now_ms();
            super::note_will_sleep(now);
            // The machine may never wake this process again (crash, update): record the moment.
            if let Some(state) = app.try_state::<AppState>() {
                let _ = state.lock().heartbeat(now);
            }
            eprintln!("[power] will sleep");
        });

        let distributed = NSDistributedNotificationCenter::defaultCenter();
        observe_on(
            &distributed,
            &NSString::from_str("com.apple.screenIsLocked"),
            || {
                super::note_screen_locked(now_ms());
                eprintln!("[power] screen locked");
            },
        );
        observe_on(
            &distributed,
            &NSString::from_str("com.apple.screenIsUnlocked"),
            || {
                super::note_screen_unlocked();
                eprintln!("[power] screen unlocked");
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: Ms = 1_000_000_000_000;

    #[test]
    fn sleep_at_prefers_will_sleep_inside_the_gap() {
        // Last tick 4 s before the real sleep: the notification wins.
        assert_eq!(
            pick_sleep_at(T0, T0 + 3_600_000, Some(T0 + 4_000)),
            T0 + 4_000
        );
        // Stale (before the tick) or bogus (after wake) values are ignored.
        assert_eq!(pick_sleep_at(T0, T0 + 3_600_000, Some(T0 - 1)), T0);
        assert_eq!(pick_sleep_at(T0, T0 + 3_600_000, Some(T0 + 3_600_001)), T0);
        assert_eq!(pick_sleep_at(T0, T0 + 3_600_000, None), T0);
    }

    #[test]
    fn unlocked_leaves_idle_untouched() {
        assert_eq!(adjust_for_lock(1_000, 900_000, T0, None), (1_000, 900_000));
    }

    #[test]
    fn locked_idle_counts_from_lock_and_threshold_drops() {
        // Locked 2 min ago, the user is typing the password (raw idle 1 s).
        let (idle, thr) = adjust_for_lock(1_000, 900_000, T0 + 120_000, Some(T0));
        assert_eq!(idle, 120_000);
        assert_eq!(thr, LOCK_MIN_MS);
        // A raw idle older than the lock (screen auto-locked after inactivity) is kept.
        let (idle, _) = adjust_for_lock(600_000, 900_000, T0 + 120_000, Some(T0));
        assert_eq!(idle, 600_000);
        // A threshold already below the lock minimum is not raised.
        assert_eq!(adjust_for_lock(0, 30_000, T0 + 1, Some(T0)).1, 30_000);
    }

    #[test]
    fn lock_drives_the_absence_monitor_from_the_lock_moment() {
        use crate::absence::{AbsenceMonitor, MonitorEvent};
        use crate::tracker::AbsenceReason;
        use std::time::Duration;

        let mono = |ms: i64| Duration::from_millis(ms as u64);
        let mut m = AbsenceMonitor::new(15 * 60_000, T0, mono(0));
        let lock = T0 + 10_000;
        // Last input right at the lock; locked 3 min (< 15 min threshold) while typing at the end.
        let mut events = Vec::new();
        for s in (15..=190).step_by(5) {
            let now = T0 + s * 1000;
            let raw_idle = if s >= 185 { 500 } else { now - lock };
            let (idle, thr) = adjust_for_lock(raw_idle, 15 * 60_000, now, Some(lock));
            m.idle_threshold_ms = thr;
            events.extend(m.tick(now, mono(s * 1000), idle, true));
        }
        assert!(events.is_empty(), "nothing while locked: {events:?}");
        // Unlocked: the next tick sees fresh input and reports the absence from the lock moment.
        let now = T0 + 195_000;
        let (idle, thr) = adjust_for_lock(1_000, 15 * 60_000, now, None);
        m.idle_threshold_ms = thr;
        assert_eq!(
            m.tick(now, mono(195_000), idle, true),
            Some(MonitorEvent::Absence {
                start: lock,
                end: now - 1_000,
                reason: AbsenceReason::Idle,
                sleep_at: None
            })
        );
    }

    #[test]
    fn short_lock_is_not_an_absence() {
        use crate::absence::AbsenceMonitor;
        use std::time::Duration;

        let mono = |ms: i64| Duration::from_millis(ms as u64);
        let mut m = AbsenceMonitor::new(15 * 60_000, T0, mono(0));
        let lock = T0 + 5_000;
        for s in (10..=50).step_by(5) {
            let now = T0 + s * 1000;
            let (idle, thr) = adjust_for_lock(now - lock, 15 * 60_000, now, Some(lock));
            m.idle_threshold_ms = thr;
            assert_eq!(m.tick(now, mono(s * 1000), idle, true), None);
        }
        let now = T0 + 55_000;
        m.idle_threshold_ms = 15 * 60_000;
        assert_eq!(m.tick(now, mono(55_000), 500, true), None);
    }
}
