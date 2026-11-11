//! Absence detection (spec 6.3): idle time over the threshold and system sleep.
//! `AbsenceMonitor` is pure; `start_monitor` drives it from a 5 s thread.

use std::time::Duration;

use chrono::Local;
use tauri::{AppHandle, Manager};

use crate::commands::{emit_if, now_ms, AppState};
use crate::domain::Ms;
use crate::tracker::{AbsenceReason, ClockStatus};

/// A wall-clock jump beyond the monotonic clock larger than this means the machine slept.
const SLEEP_GAP_MS: i64 = 30_000;
/// Input counts as resumed when idle time drops below this.
const RESUME_IDLE_MS: i64 = 5_000;
const POLL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq)]
pub enum MonitorEvent {
    Absence { start: Ms, end: Ms, reason: AbsenceReason },
}

pub struct AbsenceMonitor {
    pub idle_threshold_ms: i64,
    last_tick_wall: Ms,
    last_tick_mono: Duration,
    pending_idle_start: Option<Ms>,
    /// OS idle time seen at the last tick: the last activity before a sleep is `last_tick_wall - this`.
    last_idle_ms: i64,
    /// After a sleep absence the OS idle counter still spans the sleep; ignore it until input resumes.
    suppress_idle: bool,
}

impl AbsenceMonitor {
    pub fn new(idle_threshold_ms: i64, wall_now: Ms, mono_now: Duration) -> Self {
        Self {
            idle_threshold_ms,
            last_tick_wall: wall_now,
            last_tick_mono: mono_now,
            pending_idle_start: None,
            last_idle_ms: 0,
            suppress_idle: false,
        }
    }

    pub fn tick(
        &mut self,
        wall_now: Ms,
        mono_now: Duration,
        idle_ms: i64,
        running: bool,
    ) -> Option<MonitorEvent> {
        let wall_delta = wall_now - self.last_tick_wall;
        let mono_delta = mono_now.saturating_sub(self.last_tick_mono).as_millis() as i64;
        let slept = wall_delta - mono_delta > SLEEP_GAP_MS;
        let last_wall = self.last_tick_wall;
        let last_idle = self.last_idle_ms.max(0);
        let idle_was_suppressed = self.suppress_idle;
        self.last_tick_wall = wall_now;
        self.last_tick_mono = mono_now;
        self.last_idle_ms = idle_ms;

        if !running {
            self.pending_idle_start = None;
            self.suppress_idle = false;
            return None;
        }
        if slept {
            // Spec 6.3: the absence starts at the last activity, which may precede the sleep.
            // A suppressed counter still spans an earlier sleep, so it says nothing about activity.
            let last_activity = if idle_was_suppressed { last_wall } else { last_wall - last_idle };
            let start = self.pending_idle_start.take().map_or(last_activity, |p| p.min(last_activity)).min(last_wall);
            self.suppress_idle = idle_ms >= RESUME_IDLE_MS;
            return Some(MonitorEvent::Absence {
                start,
                end: wall_now,
                reason: AbsenceReason::Sleep,
            });
        }
        if idle_ms < RESUME_IDLE_MS {
            self.suppress_idle = false;
            return self.pending_idle_start.take().map(|start| MonitorEvent::Absence {
                start,
                end: wall_now - idle_ms,
                reason: AbsenceReason::Idle,
            });
        }
        if !self.suppress_idle && idle_ms >= self.idle_threshold_ms {
            let start = wall_now - idle_ms;
            self.pending_idle_start = Some(self.pending_idle_start.map_or(start, |p| p.min(start)));
        }
        None
    }
}

/// Polls every 5 s; on an absence tells the tracker and emits `tracker://changed`.
pub fn start_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        // Must not advance during sleep (std `Instant` does on Windows).
        let mono = || Duration::from_millis(crate::platform::monotonic_ms());
        let threshold_ms = |app: &AppHandle| {
            let state = app.state::<AppState>();
            let min = state.lock().settings().map(|s| s.idle_min).unwrap_or(15);
            i64::from(min) * 60_000
        };
        let mut monitor = AbsenceMonitor::new(threshold_ms(&app), now_ms(), mono());
        loop {
            std::thread::sleep(POLL);
            monitor.idle_threshold_ms = threshold_ms(&app);
            let state = app.state::<AppState>();
            let running = state.lock().snapshot(&Local, now_ms()).map(|s| s.status == ClockStatus::Running).unwrap_or(false);
            let idle_ms = (crate::platform::idle_seconds() * 1000.0) as i64;
            let Some(MonitorEvent::Absence { start, end, reason }) =
                monitor.tick(now_ms(), mono(), idle_ms, running)
            else {
                continue;
            };
            // Emit when the user must be asked, or stop-on-sleep left a notice.
            let mut new_question = false;
            emit_if(&app, &state, |t| t.begin_absence(&Local, start, end, reason), |asked, snap| {
                new_question = *asked && snap.pending_absence.is_some();
                *asked || snap.notice.is_some()
            });
            // The only producer of new pending absences: open the notch so the question is seen.
            if new_question {
                // System-initiated: never take keyboard focus (the user is likely typing right now).
                crate::window::expand_overlay(&app, false);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;
    const T0: Ms = 1_000_000_000_000;

    fn mono(ms: i64) -> Duration {
        Duration::from_millis(ms as u64)
    }

    /// Ticks every 5 s of real time (wall and mono advance together).
    fn feed(m: &mut AbsenceMonitor, from_s: i64, to_s: i64, idle: impl Fn(i64) -> i64, running: bool) -> Vec<MonitorEvent> {
        (from_s..=to_s)
            .step_by(5)
            .filter_map(|s| m.tick(T0 + s * 1000, mono(s * 1000), idle(s), running))
            .collect()
    }

    #[test]
    fn idle_over_threshold_emits_on_return() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        // Last input at t=10s; idle grows until t=3910s (65 min), then input resumes.
        let ev = feed(&mut m, 5, 3910, |s| if s <= 10 { 1000 } else { (s - 10) * 1000 }, true);
        assert!(ev.is_empty());
        let ev = m.tick(T0 + 3_915_000, mono(3_915_000), 1000, true);
        assert_eq!(
            ev,
            Some(MonitorEvent::Absence {
                start: T0 + 10_000,
                end: T0 + 3_914_000,
                reason: AbsenceReason::Idle
            })
        );
        assert_eq!(m.tick(T0 + 3_920_000, mono(3_920_000), 1000, true), None);
    }

    #[test]
    fn idle_under_threshold_no_event() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        let ev = feed(&mut m, 5, 600, |s| s * 1000, true);
        assert!(ev.is_empty());
        assert_eq!(m.tick(T0 + 605_000, mono(605_000), 500, true), None);
    }

    #[test]
    fn sleep_gap_emits_sleep_absence() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        assert_eq!(m.tick(T0 + 5_000, mono(5_000), 100, true), None);
        // One hour of sleep: wall advances, mono does not.
        let wake = T0 + 5_000 + 3_600_000 + 5_000;
        let ev = m.tick(wake, mono(10_000), 100, true);
        assert_eq!(
            ev,
            // Last input 100 ms before the last tick.
            Some(MonitorEvent::Absence { start: T0 + 4_900, end: wake, reason: AbsenceReason::Sleep })
        );
    }

    #[test]
    fn sleep_after_idle_starts_at_last_activity() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        // Last input at t=0; idle grows to 20 min (pending idle absence), then the lid closes.
        assert!(feed(&mut m, 5, 1200, |s| s * 1000, true).is_empty());
        let last_tick = T0 + 1_200_000;
        let wake = last_tick + 3_600_000;
        let ev = m.tick(wake, mono(1_205_000), 100, true);
        assert_eq!(
            ev,
            Some(MonitorEvent::Absence { start: last_tick - 20 * MIN, end: wake, reason: AbsenceReason::Sleep })
        );
    }

    #[test]
    fn sleep_after_short_idle_starts_at_last_activity() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        // 2 min idle (under the threshold, nothing pending) before sleeping.
        assert!(feed(&mut m, 5, 120, |s| s * 1000, true).is_empty());
        let wake = T0 + 120_000 + 3_600_000;
        let ev = m.tick(wake, mono(125_000), 100, true);
        assert_eq!(ev, Some(MonitorEvent::Absence { start: T0, end: wake, reason: AbsenceReason::Sleep }));
    }

    #[test]
    fn second_sleep_ignores_idle_counter_spanning_first_sleep() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        let wake = T0 + 3_600_000;
        assert!(m.tick(wake, mono(5_000), 3_600_000, true).is_some());
        // No input yet: the counter still spans the first sleep. Sleep again.
        assert_eq!(m.tick(wake + 5_000, mono(10_000), 3_605_000, true), None);
        let wake2 = wake + 5_000 + 3_600_000;
        let ev = m.tick(wake2, mono(15_000), 7_205_000, true);
        assert_eq!(
            ev,
            Some(MonitorEvent::Absence { start: wake + 5_000, end: wake2, reason: AbsenceReason::Sleep })
        );
    }

    #[test]
    fn sleep_with_long_idle_counter_emits_only_sleep() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        let wake = T0 + 3_600_000;
        let ev = m.tick(wake, mono(5_000), 3_600_000, true);
        assert!(matches!(ev, Some(MonitorEvent::Absence { reason: AbsenceReason::Sleep, .. })));
        // Idle counter still spans the sleep; no idle absence until input resumes.
        assert_eq!(m.tick(wake + 5_000, mono(10_000), 3_605_000, true), None);
        assert_eq!(m.tick(wake + 10_000, mono(15_000), 200, true), None);
    }

    #[test]
    fn no_events_when_not_running() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        assert!(feed(&mut m, 5, 3910, |s| s * 1000, false).is_empty());
        assert_eq!(m.tick(T0 + 3_915_000, mono(3_915_000), 1000, false), None);
        assert_eq!(m.tick(T0 + 9_000_000, mono(3_920_000), 1000, false), None);
    }

    #[test]
    fn pausing_discards_pending_idle() {
        let mut m = AbsenceMonitor::new(15 * MIN, T0, mono(0));
        feed(&mut m, 5, 1200, |s| s * 1000, true);
        assert_eq!(m.tick(T0 + 1_205_000, mono(1_205_000), 1_205_000, false), None);
        assert_eq!(m.tick(T0 + 1_210_000, mono(1_210_000), 500, true), None);
    }
}
