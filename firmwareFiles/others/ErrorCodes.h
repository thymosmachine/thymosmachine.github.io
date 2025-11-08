#ifndef ERROR_CODES_H
#define ERROR_CODES_H

#define ERROR_CODES_LIB_NAME "ErrorCodes"
#define ERROR_CODES_LIB_VERSION "1.0.4"
#define ERROR_CODES_LIB_DATE "09/04/2025"

// Define the error codes
enum class ErrorCode {
  // --- Success ---
  NONE = 0,  // No error (INFO)

  // --- System Errors ---
  SYSTEM_OVERHEAT = 100,        // Overheat detected (FATAL)
  SYSTEM_UNDERVOLTAGE = 101,    // Power supply too low (WARNING)
  SYSTEM_OVERVOLTAGE = 102,     // Power supply too high (ERROR)
  SYSTEM_MEMORY_FAILURE = 110,  // FRAM/EEPROM error (ERROR)

  // --- Communication Codes ---
  COMMUNICATION_FAIL = 200,     // Serial/I2C/SPI failure (ERROR)
  COMM_TIMEOUT = 201,           // Communication timeout (ERROR)
  COMM_INVALID_RESPONSE = 202,  // Unexpected data received (ERROR)
  USB_DISCONNECTED = 203,       // USB disconnected, actions taken (INFO)
  INVALID_COMMAND = 204,        // Invalid command

  // --- Motor Control Codes ---
  MOTOR_RUNNING = 300,      // Motor stalled (ERROR)
  MOTOR_OVERCURRENT = 301,  // Overcurrent detected (FATAL)
  MOTOR_OVERSPEED = 302,    // Speed exceeds limit (ERROR)

  MOTOR_CALIBRATION_PASS = 307,    // Calibration successful (INFO)
  MOTOR_CALIBRATION_FAIL = 308,    // Calibration failed (ERROR)
  MOTOR_NOT_CALIBRATED = 309,      // Action prohibited due to motors not calibrated (ERROR)
  MOTOR_CALIBRATION_ACTIVE = 310,  // Operation not allowed during calibration (WARNING)
  MOTOR_CALIBRATION_NOT_ACTIVE = 311,
  MOTOR_CALIBRATION_STARTED = 312,  // Operation not allowed during calibration (WARNING)
  // Error when an alarm is triggered, preventing motor movement
  MOTOR_ALARM_TRIGGERED = 313,  // Alarm triggered (ERROR)
  // Error when motor movement is blocked during motor startup
  MOTOR_STARTUP_DELAY = 314,  // Motor startup delay preventing movement (ERROR)
  // Error when motor movement is restricted by endstop conditions
  MOTOR_ENDSTOP_TRIGGERED = 315,  // Endstop triggered (ERROR)
  MOTOR_ENDSTOP_DISABLED = 316,   // Endstop not enabled (ERROR)
  // Error when movement exceeds distance limit
  MOTOR_DISTANCE_LIMIT_EXCEEDED = 317,  // Movement exceeds set distance limit (ERROR)
  // Error when AUX1 endstop triggers during motor movement
  MOTOR_AUX1_ENDSTOP_TRIGGERED = 318,  // AUX1 endstop triggered (ERROR)
  // Error when AUX2 endstop triggers during motor movement
  MOTOR_AUX2_ENDSTOP_TRIGGERED = 319,  // AUX2 endstop triggered (ERROR)
  // Error when the motor cannot move due to the service mode condition
  MOTOR_MOVEMENT_ERROR = 320,  // General motor movement error (ERROR)
  // Error when motors are trying to be moved but safety trigger is in place
  MOTOR_SAFETY_TRIGGERED = 321,  // Safety triggered
  MOTOR_SAFETY_ERROR = 322,      // Safety triggered
  SERVICE_MODE_ACTIVE = 323,     // Errors due to service mdoe active (endstops can not be enabled)
  MOTOR_STOPPED = 324,           // Motor STOPPED (INFO)
  MOTOR_WATCHDOG_EXPIRED = 325,  // Motor watchdog expired, emergency stop triggered (ERROR)

  // --- Sensor Errors ---
  SENSOR_FAILURE = 400,         // Sensor not responding (ERROR)
  SENSOR_OUT_OF_RANGE = 401,    // Sensor reading exceeds expected range (ERROR)
  MACHINE_OVERLOAD = 402,       // Machine-wide overload (ERROR)
  LOADCELL_OVERLOAD = 403,      // Single load cell overload (ERROR)
  SENSOR_NOT_PRESENT = 404,     // For example loadcell not present (ERROR)
  LOADCELL_CONNECTED = 405,     // Loadcell became present (INFO)
  LOADCELL_DISCONNECTED = 406,  // Loadcell became not present (INFO)

  // --- User Input Errors ---
  INVALID_PARAM = 500,  // Invalid input (ERROR)
  OUT_OF_RANGE = 501,   // Parameter out of allowed range (ERROR)
  INVALID_PIN = 502,    // Pins not properly configured (ERROR)

  // --- Informational Codes ---
  FUNCTION_DISABLED = 601,        // Function is disabled (INFO)
  REPEATED_ACTION_REQUEST = 602,  // Error when a function is called repeatedly without toggle (ERROR)
  DSLR_PHOTO_TRIGGERED = 603,     // DSLR photo has been taken
  DSLR_FOCUS_TRIGGERED = 604,     // DSLR focus has been triggered

  // --- MCU Command Received (for PC Reporting) ---
  MCU_COMMAND_RECEIVED_SPEED = 700,         // Speed command received
  MCU_COMMAND_RECEIVED_ACCEL = 701,         // Acceleration command received
  MCU_COMMAND_RECEIVED_POSITION = 702,      // Move to position command received
  MCU_COMMAND_RECEIVED_CALIBRATION = 703,   // Calibration toggle command received
  MCU_COMMAND_RECEIVED_STOP = 704,          // Stop command received
  MCU_COMMAND_RECEIVED_EXPERIMENT = 705,    // Experiment parameters received
  MCU_COMMAND_RECEIVED_SCREEN = 706,        // Screen update command received
  MCU_COMMAND_RECEIVED_MOTOR_ENABLE = 707,  // Motor enable toggle received
  MCU_COMMAND_RECEIVED_MOVE_DOWN = 708,     // Move down / run forward received
  MCU_COMMAND_RECEIVED_MOVE_UP = 709,       // Move up / run backward received
  MCU_COMMAND_RECEIVED_STARTUP = 710,       // Startup report command received
  MCU_COMMAND_RECEIVED_LOADCELL = 711,      // Load cell tare/reset received
  MCU_COMMAND_EXECUTION_FAILED_MOVE_DOWN = 712,
  MCU_COMMAND_EXECUTION_FAILED_MOVE_UP = 713,
  MCU_COMMAND_EXECUTION_FAILED_MOVE_TO_POS = 714,
  MCU_COMMAND_EXECUTION_FAILED_CALIB = 715,
  MCU_COMMAND_EXECUTION_FAILED_STOP = 716,
  MCU_COMMAND_RECEIVED_INVALID = 799,  // Unrecognized or invalid command

  // --- Memory Errors ---
  MEMORY_SAVE = 800,   // Successfully saved config to memory
  MEMORY_LOAD = 801,   // Successfully loaded config from memory
  MEMORY_RESET = 802,  // Successfully reset config to defaults

  MEMORY_DISABLED = 730,  // FRAM disabled

  // --- Safety Errors ---
  EMERGENCY_STOP = 900,          // Immediate shutdown required (FATAL)
  HARDWARE_LIMIT_EXCEEDED = 901  // Safety limits exceeded (FATAL)
};

// Function to convert ErrorCode to a human-readable string
const char* getErrorCodeString(ErrorCode code);
// Function to get the error level prefix
const char* getErrorLevelPrefix(ErrorCode code);

#endif  // ERROR_CODES_H
