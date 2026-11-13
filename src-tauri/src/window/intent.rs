//! Hover intent: tells "the cursor stopped on the pill" apart from "the cursor passed over it".

/// Max drift (logical px) from the anchor sample that still counts as resting.
pub const REST_RADIUS: f64 = 4.0;
/// Minimum stillness, ms. The first anchor is the entry sample, so this also bounds the time
/// spent inside the rect (no separate "minimum inside" rule is needed).
pub const REST_STILL_MS: u64 = 180;

/// Fed one sample per poll while the cursor is inside the rect. Fires at most once per session.
#[derive(Debug, Default)]
pub struct RestDetector {
    anchor: Option<(f64, f64, u64)>,
    fired: bool,
}

impl RestDetector {
    pub fn new() -> Self {
        Self::default()
    }

    /// Cursor left the rect: forget the session.
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Returns true exactly once, when the cursor has rested.
    pub fn sample(&mut self, x: f64, y: f64, t_ms: u64) -> bool {
        if self.fired {
            return false;
        }
        let at = match self.anchor {
            Some(a) if (x - a.0).hypot(y - a.1) <= REST_RADIUS => a.2,
            _ => {
                self.anchor = Some((x, y, t_ms));
                t_ms
            }
        };
        if t_ms - at >= REST_STILL_MS {
            self.fired = true;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STEP: u64 = 33;

    #[test]
    fn passing_through_never_rests() {
        let mut d = RestDetector::new();
        for i in 0..40u64 {
            assert!(!d.sample(i as f64 * 10.0, 5.0, i * STEP));
        }
    }

    #[test]
    fn moving_in_then_stopping_rests_after_stillness() {
        let mut d = RestDetector::new();
        let mut t = 0;
        for i in 0..5 {
            assert!(!d.sample(i as f64 * 12.0, 5.0, t));
            t += STEP;
        }
        let x = 48.0;
        let mut fired_at = None;
        let stop = t;
        for _ in 0..20 {
            if d.sample(x, 5.0, t) {
                fired_at = Some(t - stop);
                break;
            }
            t += STEP;
        }
        let waited = fired_at.expect("should rest");
        assert!(
            (REST_STILL_MS - STEP..=REST_STILL_MS + STEP).contains(&waited),
            "{waited}"
        );
    }

    #[test]
    fn small_jitter_counts_as_rest() {
        let mut d = RestDetector::new();
        let mut hit = false;
        for i in 0..20u64 {
            let j = if i % 2 == 0 { 0.0 } else { 3.0 };
            hit |= d.sample(100.0 + j, 5.0, i * STEP);
        }
        assert!(hit);
    }

    #[test]
    fn too_short_inside_never_rests() {
        let mut d = RestDetector::new();
        // Still, but only 99 ms inside.
        for i in 0..4u64 {
            assert!(!d.sample(10.0, 5.0, i * STEP));
        }
    }

    /// The anchor is fixed (not dragged along), so a slow creep that stays under the radius per
    /// sample but drifts past it overall keeps re-anchoring and never counts as resting.
    #[test]
    fn slow_creep_never_rests() {
        let mut d = RestDetector::new();
        for i in 0..60u64 {
            // 3 px per 33 ms sample (~90 px/s): each step < REST_RADIUS, 180 px in total.
            assert!(
                !d.sample(i as f64 * 3.0, 5.0, i * STEP),
                "fired at sample {i}"
            );
        }
        let mut d = RestDetector::new();
        for i in 0..60u64 {
            // 1 px per sample (~30 px/s) diagonally still leaves the radius before 180 ms.
            let p = i as f64;
            assert!(!d.sample(p, p * 0.5, i * STEP), "fired at sample {i}");
        }
    }

    /// Sub-pixel drift (hand tremor, < REST_RADIUS within REST_STILL_MS) is resting.
    #[test]
    fn imperceptible_creep_rests() {
        let mut d = RestDetector::new();
        let fired = (0..20u64).find(|&i| d.sample(100.0 + i as f64 * 0.5, 5.0, i * STEP));
        assert_eq!(fired, Some(6), "rests after ~REST_STILL_MS");
    }

    #[test]
    fn reset_allows_new_rest_and_fires_once() {
        let mut d = RestDetector::new();
        let run = |d: &mut RestDetector| {
            (0..30u64)
                .filter(|i| d.sample(10.0, 5.0, 1000 + i * STEP))
                .count()
        };
        assert_eq!(run(&mut d), 1);
        assert_eq!(run(&mut d), 0);
        d.reset();
        assert_eq!(run(&mut d), 1);
    }
}
