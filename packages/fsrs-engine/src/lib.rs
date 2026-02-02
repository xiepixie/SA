//! FSRS Engine - FFI wrapper for rs-fsrs
//!
//! Provides C-compatible FFI functions for Bun/Node.js integration.
//! All functions use JSON strings for complex data exchange.
//!
//! This implementation uses the lightweight rs-fsrs crate instead of
//! the full fsrs crate (which depends on Burn ML framework).

use chrono::{DateTime, Utc};
use rs_fsrs::{Card, FSRS, Parameters, Rating, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

// ============================================================
// Data Structures (JSON serializable)
// ============================================================

/// Input memory state from the caller
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInput {
    pub stability: f64,
    pub difficulty: f64,
}

/// Card state for a specific rating
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardState {
    pub stability: f64,
    pub difficulty: f64,
    pub interval: f64,
}

/// All possible next states after a review
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllNextStates {
    pub again: CardState,
    pub hard: CardState,
    pub good: CardState,
    pub easy: CardState,
}

/// Complete review result including the selected state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResult {
    /// The selected state based on rating
    pub selected: CardState,
    /// All possible states for preview
    pub all_states: AllNextStates,
    /// Current retrievability (0-1)
    pub retrievability: f64,
}

/// Error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: i32,
}

// ============================================================
// Helper Functions
// ============================================================

/// Convert C string pointer to Rust string
unsafe fn cstr_to_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string())
}

/// Convert Rust string to C string pointer (caller must free)
fn string_to_cstr(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(cstr) => cstr.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Parse weights from JSON string and create Parameters
fn parse_parameters(weights_json: Option<String>) -> Parameters {
    weights_json
        .and_then(|json| {
            if json.is_empty() || json == "null" {
                None
            } else {
                serde_json::from_str::<Vec<f64>>(&json).ok()
            }
        })
        .map(|weights| {
            // Convert Vec<f64> to [f64; 19] for Parameters
            let mut arr = [0.0f64; 19];
            for (i, &w) in weights.iter().take(19).enumerate() {
                arr[i] = w;
            }
            Parameters {
                w: arr,
                ..Default::default()
            }
        })
        .unwrap_or_default()
}

/// Create FSRS instance with optional parameters
fn create_fsrs(params: Parameters) -> FSRS {
    FSRS::new(params)
}

/// Create a Card from memory state and elapsed days
fn create_card_from_memory(
    memory: Option<MemoryInput>,
    days_elapsed: u32,
    now: DateTime<Utc>,
) -> Card {
    match memory {
        Some(m) => {
            // Create a card with existing memory state
            let last_review = now - chrono::Duration::days(days_elapsed as i64);
            Card {
                stability: m.stability,
                difficulty: m.difficulty,
                state: State::Review,
                due: now,
                last_review: last_review,
                reps: 1,
                lapses: 0,
                elapsed_days: days_elapsed as i64,
                scheduled_days: 0,
            }
        }
        None => {
            // New card
            Card::new()
        }
    }
}

/// Convert rs-fsrs results to our AllNextStates format
fn convert_to_all_states(
    record_log: &HashMap<Rating, rs_fsrs::SchedulingInfo>,
) -> AllNextStates {
    let get_state = |rating: Rating| -> CardState {
        let info = record_log.get(&rating).unwrap();
        CardState {
            stability: info.card.stability,
            difficulty: info.card.difficulty,
            interval: info.card.scheduled_days as f64,
        }
    };

    AllNextStates {
        again: get_state(Rating::Again),
        hard: get_state(Rating::Hard),
        good: get_state(Rating::Good),
        easy: get_state(Rating::Easy),
    }
}

/// Select state based on rating
fn select_state(states: &AllNextStates, rating: i32) -> CardState {
    match rating {
        1 => states.again.clone(),
        2 => states.hard.clone(),
        3 => states.good.clone(),
        4 => states.easy.clone(),
        _ => states.good.clone(),
    }
}

/// Convert rating integer to rs-fsrs Rating enum
#[allow(dead_code)]
fn int_to_rating(rating: i32) -> Rating {
    match rating {
        1 => Rating::Again,
        2 => Rating::Hard,
        3 => Rating::Good,
        4 => Rating::Easy,
        _ => Rating::Good,
    }
}

// ============================================================
// FFI Functions
// ============================================================

/// Calculate next states for all ratings
///
/// # Arguments
/// * `memory_json` - JSON string of MemoryInput, or empty/null for new card
/// * `desired_retention` - Target retention rate (0.7-0.99, typically 0.9)
/// * `days_elapsed` - Days since last review (0 for new card)
/// * `weights_json` - JSON array of FSRS parameters, or empty for defaults
///
/// # Returns
/// JSON string of AllNextStates or ErrorResponse
#[no_mangle]
pub extern "C" fn fsrs_next_states(
    memory_json: *const c_char,
    desired_retention: f64,
    days_elapsed: u32,
    weights_json: *const c_char,
) -> *mut c_char {
    let result = (|| -> Result<AllNextStates, String> {
        // Parse memory state
        let memory_str = unsafe { cstr_to_string(memory_json) };
        let memory_state: Option<MemoryInput> = memory_str.and_then(|s| {
            if s.is_empty() || s == "null" {
                None
            } else {
                serde_json::from_str(&s).ok()
            }
        });

        // Parse weights and create parameters
        let weights_str = unsafe { cstr_to_string(weights_json) };
        let mut params = parse_parameters(weights_str);
        params.request_retention = desired_retention;

        // Create FSRS instance
        let fsrs = create_fsrs(params);

        // Create card from memory state
        let now = Utc::now();
        let card = create_card_from_memory(memory_state, days_elapsed, now);

        // Calculate next states for all ratings
        let record_log = fsrs.repeat(card, now);

        Ok(convert_to_all_states(&record_log))
    })();

    let json = match result {
        Ok(states) => serde_json::to_string(&states).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => serde_json::to_string(&ErrorResponse { error: e, code: 1 })
            .unwrap_or_else(|_| r#"{"error":"serialization failed","code":2}"#.to_string()),
    };

    string_to_cstr(json)
}

/// Calculate review result for a specific rating
///
/// # Arguments
/// * `memory_json` - JSON string of MemoryInput, or empty/null for new card
/// * `rating` - User rating (1=Again, 2=Hard, 3=Good, 4=Easy)
/// * `desired_retention` - Target retention rate (0.7-0.99)
/// * `days_elapsed` - Days since last review
/// * `weights_json` - JSON array of FSRS parameters
///
/// # Returns
/// JSON string of ReviewResult or ErrorResponse
#[no_mangle]
pub extern "C" fn fsrs_review(
    memory_json: *const c_char,
    rating: i32,
    desired_retention: f64,
    days_elapsed: u32,
    weights_json: *const c_char,
) -> *mut c_char {
    let result = (|| -> Result<ReviewResult, String> {
        // Validate rating
        if !(1..=4).contains(&rating) {
            return Err(format!("Invalid rating: {}. Must be 1-4.", rating));
        }

        // Parse memory state
        let memory_str = unsafe { cstr_to_string(memory_json) };
        let memory_state: Option<MemoryInput> = memory_str.and_then(|s| {
            if s.is_empty() || s == "null" {
                None
            } else {
                serde_json::from_str(&s).ok()
            }
        });

        // Parse weights and create parameters
        let weights_str = unsafe { cstr_to_string(weights_json) };
        let mut params = parse_parameters(weights_str);
        params.request_retention = desired_retention;

        // Create FSRS instance
        let fsrs = create_fsrs(params);

        // Create card from memory state
        let now = Utc::now();
        let card = create_card_from_memory(memory_state.clone(), days_elapsed, now);

        // Calculate next states for all ratings
        let record_log = fsrs.repeat(card.clone(), now);

        let all_states = convert_to_all_states(&record_log);
        let selected = select_state(&all_states, rating);

        // Calculate current retrievability using FSRS formula
        // R = (1 + t/S)^(-1) where t = elapsed days, S = stability
        let retrievability = if let Some(m) = &memory_state {
            if m.stability > 0.0 {
                (1.0 + days_elapsed as f64 / m.stability).powf(-1.0)
            } else {
                1.0
            }
        } else {
            1.0 // New card has 100% retrievability
        };

        Ok(ReviewResult {
            selected,
            all_states,
            retrievability,
        })
    })();

    let json = match result {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => serde_json::to_string(&ErrorResponse { error: e, code: 1 })
            .unwrap_or_else(|_| r#"{"error":"serialization failed","code":2}"#.to_string()),
    };

    string_to_cstr(json)
}

/// Migrate from SM-2 to FSRS memory state
///
/// This is a simplified migration that estimates FSRS parameters from SM-2 values.
/// The conversion is approximate and based on empirical observations.
///
/// # Arguments
/// * `ease_factor` - SM-2 ease factor (typically 1.3-2.5+)
/// * `interval` - Current interval in days
/// * `sm2_retention` - Estimated retention rate (typically 0.9)
/// * `weights_json` - JSON array of FSRS parameters (unused, kept for API compatibility)
///
/// # Returns
/// JSON string of MemoryInput or ErrorResponse
#[no_mangle]
pub extern "C" fn fsrs_migrate_sm2(
    ease_factor: f64,
    interval: f64,
    _sm2_retention: f64,
    _weights_json: *const c_char,
) -> *mut c_char {
    let result = (|| -> Result<MemoryInput, String> {
        // Convert SM-2 ease factor to FSRS difficulty
        // SM-2 ease factor range: 1.3 (hard) to 2.5+ (easy)
        // FSRS difficulty range: 1 (easy) to 10 (hard)
        // Inverse relationship: higher ease = lower difficulty
        let difficulty = ((2.5 - ease_factor.clamp(1.3, 2.5)) / 1.2 * 9.0 + 1.0).clamp(1.0, 10.0);

        // Estimate stability from interval
        // For a card with the given interval at ~90% retention,
        // stability ≈ interval (simplified approximation)
        let stability = interval.max(0.4);

        Ok(MemoryInput {
            stability,
            difficulty,
        })
    })();

    let json = match result {
        Ok(memory) => serde_json::to_string(&memory).unwrap_or_else(|_| "{}".to_string()),
        Err(e) => serde_json::to_string(&ErrorResponse { error: e, code: 1 })
            .unwrap_or_else(|_| r#"{"error":"serialization failed","code":2}"#.to_string()),
    };

    string_to_cstr(json)
}

/// Calculate current retrievability
///
/// # Arguments
/// * `stability` - Memory stability
/// * `difficulty` - Memory difficulty (unused but kept for API consistency)
/// * `days_elapsed` - Days since last review
///
/// # Returns
/// Retrievability as f64 (0-1)
#[no_mangle]
pub extern "C" fn fsrs_retrievability(stability: f64, _difficulty: f64, days_elapsed: u32) -> f64 {
    // FSRS retrievability formula: R = (1 + t/S)^(-1)
    // where t = elapsed days, S = stability
    if stability <= 0.0 {
        return 0.0;
    }
    (1.0 + days_elapsed as f64 / stability).powf(-1.0)
}

/// Calculate next interval for a given stability and rating
///
/// # Arguments
/// * `stability` - Current stability (0 or negative for new card)
/// * `desired_retention` - Target retention rate
/// * `rating` - User rating (1-4)
/// * `weights_json` - JSON array of FSRS parameters
///
/// # Returns
/// Next interval in days as f64
#[no_mangle]
pub extern "C" fn fsrs_next_interval(
    stability: f64,
    desired_retention: f64,
    rating: u32,
    weights_json: *const c_char,
) -> f64 {
    let weights_str = unsafe { cstr_to_string(weights_json) };
    let mut params = parse_parameters(weights_str);
    params.request_retention = desired_retention;

    let fsrs = create_fsrs(params);
    let now = Utc::now();

    // Create a card with the given stability
    let card = if stability > 0.0 {
        Card {
            stability,
            difficulty: 5.0, // Default difficulty
            state: State::Review,
            due: now,
            last_review: now,
            reps: 1,
            lapses: 0,
            elapsed_days: 0,
            scheduled_days: 0,
        }
    } else {
        Card::new()
    };

    // Get the interval for the specified rating
    let record_log = fsrs.repeat(card, now);
    let rating_enum = match rating {
        1 => Rating::Again,
        2 => Rating::Hard,
        3 => Rating::Good,
        4 => Rating::Easy,
        _ => Rating::Good,
    };

    record_log
        .get(&rating_enum)
        .map(|info| info.card.scheduled_days as f64)
        .unwrap_or(-1.0)
}

/// Free a string allocated by this library
///
/// # Safety
/// The pointer must have been returned by one of this library's functions
#[no_mangle]
pub extern "C" fn fsrs_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

/// Get library version
#[no_mangle]
pub extern "C" fn fsrs_version() -> *mut c_char {
    string_to_cstr(env!("CARGO_PKG_VERSION").to_string())
}

/// Get default FSRS parameters as JSON array
#[no_mangle]
pub extern "C" fn fsrs_default_parameters() -> *mut c_char {
    let params = Parameters::default();
    let weights: Vec<f64> = params.w.to_vec();
    let json = serde_json::to_string(&weights).unwrap_or_else(|_| "[]".to_string());
    string_to_cstr(json)
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn read_and_free(ptr: *mut c_char) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let s = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
        fsrs_free_string(ptr);
        s
    }

    #[test]
    fn test_new_card_review() {
        let result_ptr = fsrs_next_states(std::ptr::null(), 0.9, 0, std::ptr::null());
        let result = read_and_free(result_ptr);
        println!("New card result: {}", result);

        let states: AllNextStates = serde_json::from_str(&result).unwrap();
        assert!(states.again.interval >= 0.0);
        assert!(states.good.interval >= states.again.interval);
        assert!(states.easy.interval >= states.good.interval);
    }

    #[test]
    fn test_review_with_memory() {
        let memory = MemoryInput {
            stability: 10.0,
            difficulty: 5.0,
        };
        let memory_json = CString::new(serde_json::to_string(&memory).unwrap()).unwrap();

        let result_ptr = fsrs_review(memory_json.as_ptr(), 3, 0.9, 5, std::ptr::null());
        let result = read_and_free(result_ptr);
        println!("Review result: {}", result);

        let review: ReviewResult = serde_json::from_str(&result).unwrap();
        assert!(review.selected.stability > 0.0);
        assert!(review.retrievability > 0.0 && review.retrievability <= 1.0);
    }

    #[test]
    fn test_retrievability() {
        let r = fsrs_retrievability(10.0, 5.0, 5);
        println!("Retrievability: {}", r);
        assert!(r > 0.0 && r <= 1.0);
    }

    #[test]
    fn test_sm2_migration() {
        let result_ptr = fsrs_migrate_sm2(2.5, 10.0, 0.9, std::ptr::null());
        let result = read_and_free(result_ptr);
        println!("SM2 migration result: {}", result);

        let memory: MemoryInput = serde_json::from_str(&result).unwrap();
        assert!(memory.stability > 0.0);
        assert!(memory.difficulty > 0.0 && memory.difficulty <= 10.0);
    }

    #[test]
    fn test_default_parameters() {
        let result_ptr = fsrs_default_parameters();
        let result = read_and_free(result_ptr);
        println!("Default parameters: {}", result);

        let params: Vec<f64> = serde_json::from_str(&result).unwrap();
        assert!(!params.is_empty());
    }

    #[test]
    fn test_version() {
        let result_ptr = fsrs_version();
        let result = read_and_free(result_ptr);
        println!("Version: {}", result);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_invalid_rating() {
        let result_ptr = fsrs_review(std::ptr::null(), 5, 0.9, 0, std::ptr::null());
        let result = read_and_free(result_ptr);
        println!("Invalid rating result: {}", result);

        let error: ErrorResponse = serde_json::from_str(&result).unwrap();
        assert!(error.error.contains("Invalid rating"));
    }
}
