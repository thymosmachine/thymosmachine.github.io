#include "ErrorCodes.h"

// Function to get the error level prefix
const char* getErrorLevelPrefix(ErrorCode code) {
  switch (code) {
    case ErrorCode::NONE:
    case ErrorCode::FUNCTION_DISABLED:
    case ErrorCode::REPEATED_ACTION_REQUEST:
    case ErrorCode::MOTOR_CALIBRATION_PASS:
    case ErrorCode::MOTOR_STOPPED:
    case ErrorCode::MOTOR_CALIBRATION_STARTED:
    case ErrorCode::DSLR_PHOTO_TRIGGERED:
    case ErrorCode::DSLR_FOCUS_TRIGGERED:
    case ErrorCode::MCU_COMMAND_RECEIVED_SPEED:
    case ErrorCode::MCU_COMMAND_RECEIVED_ACCEL:
    case ErrorCode::MCU_COMMAND_RECEIVED_POSITION:
    case ErrorCode::MCU_COMMAND_RECEIVED_CALIBRATION:
    case ErrorCode::MCU_COMMAND_RECEIVED_STOP:
    case ErrorCode::MCU_COMMAND_RECEIVED_EXPERIMENT:
    case ErrorCode::MCU_COMMAND_RECEIVED_SCREEN:
    case ErrorCode::MCU_COMMAND_RECEIVED_MOTOR_ENABLE:
    case ErrorCode::MCU_COMMAND_RECEIVED_MOVE_DOWN:
    case ErrorCode::MCU_COMMAND_RECEIVED_MOVE_UP:
    case ErrorCode::MCU_COMMAND_RECEIVED_STARTUP:
    case ErrorCode::MCU_COMMAND_RECEIVED_LOADCELL:
    case ErrorCode::MCU_COMMAND_RECEIVED_INVALID:
    case ErrorCode::MEMORY_SAVE:
    case ErrorCode::MEMORY_LOAD:
    case ErrorCode::MEMORY_RESET:
    case ErrorCode::LOADCELL_CONNECTED:
    case ErrorCode::LOADCELL_DISCONNECTED:
      return "ℹ️ INFO";  // INFO

    // --- System Errors ---
    case ErrorCode::SYSTEM_UNDERVOLTAGE:
    case ErrorCode::MOTOR_CALIBRATION_ACTIVE:
    case ErrorCode::MOTOR_CALIBRATION_NOT_ACTIVE:
      return "⚠️ WARNING";  // WARNING

    // --- General Errors ---
    case ErrorCode::SYSTEM_OVERVOLTAGE:
    case ErrorCode::COMMUNICATION_FAIL:
    case ErrorCode::COMM_TIMEOUT:
    case ErrorCode::COMM_INVALID_RESPONSE:
    case ErrorCode::MOTOR_OVERSPEED:
    case ErrorCode::SENSOR_FAILURE:
    case ErrorCode::SENSOR_OUT_OF_RANGE:
    case ErrorCode::INVALID_PARAM:
    case ErrorCode::OUT_OF_RANGE:
    case ErrorCode::MOTOR_DISTANCE_LIMIT_EXCEEDED:
    case ErrorCode::MOTOR_ENDSTOP_DISABLED:
    case ErrorCode::MOTOR_SAFETY_TRIGGERED:
    case ErrorCode::MOTOR_SAFETY_ERROR:
    case ErrorCode::SERVICE_MODE_ACTIVE:
    case ErrorCode::MOTOR_CALIBRATION_FAIL:
    case ErrorCode::USB_DISCONNECTED:
    case ErrorCode::MOTOR_WATCHDOG_EXPIRED:
    case ErrorCode::MACHINE_OVERLOAD:
    case ErrorCode::LOADCELL_OVERLOAD:
    case ErrorCode::INVALID_COMMAND:
    case ErrorCode::SENSOR_NOT_PRESENT:
    case ErrorCode::INVALID_PIN:
    case ErrorCode::MOTOR_RUNNING:
    case ErrorCode::MEMORY_DISABLED:
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_MOVE_DOWN:
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_MOVE_UP:
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_MOVE_TO_POS:
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_CALIB:
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_STOP:
      return "❌ ERROR";  // ERROR

    // --- Fatal Errors ---
    case ErrorCode::SYSTEM_OVERHEAT:
    case ErrorCode::SYSTEM_MEMORY_FAILURE:
    case ErrorCode::MOTOR_OVERCURRENT:
    case ErrorCode::EMERGENCY_STOP:
    case ErrorCode::HARDWARE_LIMIT_EXCEEDED:
    case ErrorCode::MOTOR_ALARM_TRIGGERED:
    case ErrorCode::MOTOR_STARTUP_DELAY:
    case ErrorCode::MOTOR_ENDSTOP_TRIGGERED:
    case ErrorCode::MOTOR_AUX1_ENDSTOP_TRIGGERED:
    case ErrorCode::MOTOR_AUX2_ENDSTOP_TRIGGERED:
    case ErrorCode::MOTOR_MOVEMENT_ERROR:
      return "❌ FATAL";  // FATAL

    default:
      return "ERR";  // Default to ERROR if unknown
  }
}

// Function to convert error codes to readable messages
const char* getErrorCodeString(ErrorCode code) {
  switch (code) {
    case ErrorCode::NONE: return "No Error";

    // --- System Codes ---
    case ErrorCode::SYSTEM_OVERHEAT: return "System Overheat";
    case ErrorCode::SYSTEM_UNDERVOLTAGE: return "Undervoltage";
    case ErrorCode::SYSTEM_OVERVOLTAGE: return "Overvoltage";
    case ErrorCode::SYSTEM_MEMORY_FAILURE: return "Memory Failure";
    case ErrorCode::FUNCTION_DISABLED: return "Function Disabled";
    case ErrorCode::INVALID_COMMAND:
      return "Invalid command";

      // --- DSLR Codes ---
    case ErrorCode::DSLR_PHOTO_TRIGGERED: return "DSLR Photo Triggered";
    case ErrorCode::DSLR_FOCUS_TRIGGERED: return "DSLR Focus Triggered";

    // --- Communication Codes ---
    case ErrorCode::COMMUNICATION_FAIL: return "Comm Fail";
    case ErrorCode::COMM_TIMEOUT: return "Comm Timeout";
    case ErrorCode::COMM_INVALID_RESPONSE: return "Invalid Response";
    case ErrorCode::USB_DISCONNECTED: return "USB Disconnected";

    // --- Motor Control Codes ---
    case ErrorCode::MOTOR_RUNNING: return "Motor running";
    case ErrorCode::MOTOR_OVERCURRENT: return "Motor Overcurrent";
    case ErrorCode::MOTOR_OVERSPEED: return "Motor Overspeed";
    case ErrorCode::MOTOR_CALIBRATION_ACTIVE: return "Calibration Active";
    case ErrorCode::MOTOR_CALIBRATION_NOT_ACTIVE: return "Calibration not active";
    case ErrorCode::MOTOR_CALIBRATION_PASS: return "Calibration Successful";
    case ErrorCode::MOTOR_CALIBRATION_FAIL: return "Calibration Failed";
    case ErrorCode::MOTOR_CALIBRATION_STARTED: return "Calibration Started";
    case ErrorCode::MOTOR_ALARM_TRIGGERED: return "Alarm Triggered";
    case ErrorCode::MOTOR_STARTUP_DELAY: return "Motor Startup Delay";
    case ErrorCode::MOTOR_ENDSTOP_TRIGGERED: return "Endstop Triggered";
    case ErrorCode::MOTOR_ENDSTOP_DISABLED: return "Endstops disabled";
    case ErrorCode::MOTOR_AUX1_ENDSTOP_TRIGGERED: return "AUX1 Endstop Triggered";
    case ErrorCode::MOTOR_AUX2_ENDSTOP_TRIGGERED: return "AUX2 Endstop Triggered";
    case ErrorCode::MOTOR_DISTANCE_LIMIT_EXCEEDED: return "Machine distance limit exceeded";
    case ErrorCode::MOTOR_MOVEMENT_ERROR: return "Motor Movement Error";
    case ErrorCode::MOTOR_SAFETY_TRIGGERED: return "Motor safety return triggered";
    case ErrorCode::MOTOR_SAFETY_ERROR: return "Safety return error: can not backup";
    case ErrorCode::SERVICE_MODE_ACTIVE: return "Service mode enabled";
    case ErrorCode::MOTOR_STOPPED: return "Motors stopped";
    case ErrorCode::MOTOR_WATCHDOG_EXPIRED: return "Motor Watchdog Expired";

    // --- MCU (Display) Codes ---
    case ErrorCode::MCU_COMMAND_RECEIVED_SPEED: return "MCU: Speed Command";
    case ErrorCode::MCU_COMMAND_RECEIVED_ACCEL: return "MCU: Acceleration Command";
    case ErrorCode::MCU_COMMAND_RECEIVED_POSITION: return "MCU: Move to Position";
    case ErrorCode::MCU_COMMAND_RECEIVED_CALIBRATION: return "MCU: Calibration Toggle";
    case ErrorCode::MCU_COMMAND_RECEIVED_STOP: return "MCU: Stop All";
    case ErrorCode::MCU_COMMAND_RECEIVED_EXPERIMENT: return "MCU: Experiment Params";
    case ErrorCode::MCU_COMMAND_RECEIVED_SCREEN: return "MCU: Screen Command";
    case ErrorCode::MCU_COMMAND_RECEIVED_MOTOR_ENABLE: return "MCU: Toggle Motor Enable";
    case ErrorCode::MCU_COMMAND_RECEIVED_MOVE_DOWN: return "MCU: Move Down";
    case ErrorCode::MCU_COMMAND_RECEIVED_MOVE_UP: return "MCU: Move Up";
    case ErrorCode::MCU_COMMAND_RECEIVED_STARTUP: return "MCU: Startup Report";
    case ErrorCode::MCU_COMMAND_RECEIVED_LOADCELL: return "MCU: Load Cell Action";
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_MOVE_DOWN: return "MCU: Failed to Execute Move Down";
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_MOVE_UP: return "MCU: Failed to Execute Move Up";
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_MOVE_TO_POS: return "MCU: Failed to Execute Move to Position";
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_CALIB: return "MCU: Calibration Toggle Failed";
    case ErrorCode::MCU_COMMAND_EXECUTION_FAILED_STOP: return "MCU: Stop Command Failed";
    case ErrorCode::MCU_COMMAND_RECEIVED_INVALID: return "MCU: Invalid Command";

    // --- Sensor Codes ---
    case ErrorCode::SENSOR_FAILURE: return "Sensor Fail";
    case ErrorCode::SENSOR_OUT_OF_RANGE: return "Sensor OOR";
    case ErrorCode::MACHINE_OVERLOAD: return "Machine Overload";
    case ErrorCode::LOADCELL_OVERLOAD: return "Loadcell Overload";
    case ErrorCode::SENSOR_NOT_PRESENT: return "Loadcell not present";
    case ErrorCode::LOADCELL_CONNECTED: return "Loadcell connected";
    case ErrorCode::LOADCELL_DISCONNECTED: return "Loadcell disconnected";

    // --- User Input Codes ---
    case ErrorCode::INVALID_PARAM: return "Invalid Param";
    case ErrorCode::OUT_OF_RANGE: return "Out of Range";
    case ErrorCode::REPEATED_ACTION_REQUEST: return "Repeated action request";
    case ErrorCode::INVALID_PIN: return "Invalid Pin Configuration";

    // --- Memory Codes ---
    case ErrorCode::MEMORY_SAVE: return "Memory save successful";
    case ErrorCode::MEMORY_LOAD: return "Memory load successful";
    case ErrorCode::MEMORY_RESET: return "Memory reset successful";

    case ErrorCode::MEMORY_DISABLED: return "Memory failed: FRAM disabled";

    // --- Safety Codes ---
    case ErrorCode::EMERGENCY_STOP: return "Emergency Stop";
    case ErrorCode::HARDWARE_LIMIT_EXCEEDED: return "Hardware Limit";


    default: return "Unknown Error";
  }
}
