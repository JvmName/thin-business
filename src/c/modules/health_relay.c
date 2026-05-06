#include "health_relay.h"
#include <pebble.h>
#include <message_keys.auto.h>

static AppTimer *s_retry_timer = NULL;
static AppTimer *s_startup_timer = NULL;

static void schedule_retry(uint32_t ms);

static void send_health_snapshot(void) {
#if defined(PBL_HEALTH)
  HealthServiceAccessibilityMask mask =
      health_service_metric_accessible(HealthMetricStepCount,
          time_start_of_today(), time(NULL));
  int32_t steps = 0;
  int32_t distance_m = 0;
  int32_t hr_bpm = 0;
  if (mask & HealthServiceAccessibilityMaskAvailable) {
    HealthValue v = health_service_sum_today(HealthMetricStepCount);
    steps = v > 0 ? v : 0;
    v = health_service_sum_today(HealthMetricWalkedDistanceMeters);
    distance_m = v > 0 ? v : 0;
    v = health_service_peek_current_value(HealthMetricHeartRateBPM);
    hr_bpm = v > 0 ? v : 0;
  }

  DictionaryIterator *iter = NULL;
  AppMessageResult result = app_message_outbox_begin(&iter);
  if (result != APP_MSG_OK) {
    schedule_retry(2000);
    return;
  }

  dict_write_int32(iter, MESSAGE_KEY_HEALTH_STEPS, steps);
  dict_write_int32(iter, MESSAGE_KEY_HEALTH_DISTANCE_M, distance_m);
  dict_write_int32(iter, MESSAGE_KEY_HEALTH_HR_BPM, hr_bpm);

  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    schedule_retry(2000);
  }
#endif
}

static void retry_timer_handler(void *context) {
  (void)context;
  s_retry_timer = NULL;
  send_health_snapshot();
}

static void schedule_retry(uint32_t ms) {
  if (s_retry_timer) return;
  s_retry_timer = app_timer_register(ms, retry_timer_handler, NULL);
}

static void startup_timer_handler(void *context) {
  (void)context;
  s_startup_timer = NULL;
  send_health_snapshot();
}

static void health_event_handler(HealthEventType type, void *context) {
  (void)context;
  if (type == HealthEventMovementUpdate || type == HealthEventHeartRateUpdate) {
    send_health_snapshot();
  }
}

void health_relay_init(void) {
#if defined(PBL_HEALTH)
  health_service_events_subscribe(health_event_handler, NULL);
  s_startup_timer = app_timer_register(1000, startup_timer_handler, NULL);
#endif
}

void health_relay_deinit(void) {
#if defined(PBL_HEALTH)
  health_service_events_unsubscribe();
  if (s_startup_timer) {
    app_timer_cancel(s_startup_timer);
    s_startup_timer = NULL;
  }
  if (s_retry_timer) {
    app_timer_cancel(s_retry_timer);
    s_retry_timer = NULL;
  }
#endif
}
