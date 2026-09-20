#include <Arduino.h>
#include <SCServo.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WebSocketsClient.h>

// Integrated controller for Waveshare General Driver for Robots (ESP32-WROOM-32UE).
// UART0/USB: PC controller, 115200 8N1
// UART2: STM32 four-channel motor board, RX=GPIO16, TX=GPIO27, 115200 8N1
// UART1: ST3215 arm servo bus, RX=GPIO18, TX=GPIO19, 1000000 8N1

namespace {

constexpr uint32_t PC_BAUD = 115200;
constexpr int MOTOR_RX_PIN = 16;
constexpr int MOTOR_TX_PIN = 27;
constexpr uint32_t MOTOR_BAUD = 115200;
constexpr int SERVO_RX_PIN = 18;
constexpr int SERVO_TX_PIN = 19;
constexpr uint32_t SERVO_BAUD = 1000000;

// Change these values before compiling if the deployment changes.
const char WIFI_SSID[] = "main";
const char WIFI_PASSWORD[] = "88888888";
char websocketHost[16] = "";
constexpr uint16_t WEBSOCKET_PORT = 8088;
const char WEBSOCKET_PATH[] = "/ws/car";
constexpr bool WEBSOCKET_TLS = false;
constexpr uint16_t DISCOVERY_PORT = 4210;
constexpr uint16_t DISCOVERY_LOCAL_PORT = 4211;
constexpr unsigned long DISCOVERY_INTERVAL_MS = 2000;

// Onboard TB6612 motor-A output. Connect the 12V lamp across either A1 or A2.
constexpr int LIGHT_PWM_PIN = 25;
constexpr int LIGHT_AIN1_PIN = 21;
constexpr int LIGHT_AIN2_PIN = 17;

constexpr uint8_t GRIPPER_ID = 11;
constexpr uint8_t SHOULDER_DRIVE_ID = 12;
constexpr uint8_t SHOULDER_FOLLOW_ID = 13;
constexpr uint8_t ELBOW_ID = 14;
constexpr uint8_t BASE_ID = 15;

constexpr int TURN_90_STEPS = 1024;
constexpr int TURN_45_STEPS = TURN_90_STEPS / 2;
constexpr int SERVO_SAFE_MAX_POSITION = 4050;
constexpr int GRIPPER_OPEN_STEPS = 1707;
constexpr int ARM_JOYSTICK_MAX_STEPS = TURN_90_STEPS;
constexpr int GRIPPER_CW_SIGN = +1;
constexpr int ELBOW_CCW_SIGN = -1;
constexpr int SHOULDER_CW_DRIVE_SIGN = +1;
constexpr int BASE_CW_SIGN = +1;
constexpr uint16_t ARM_SPEED = 400;
constexpr uint8_t ARM_ACCELERATION = 20;
constexpr unsigned long ACTION_TIME_MS = 3500;
constexpr unsigned long RESTORE_TIME_MS = 5000;
constexpr unsigned long LOOP_PAUSE_MS = 1000;
constexpr unsigned long INSPECTION_SCAN_TIME_MS = 2200;
constexpr unsigned long INSPECTION_MOTION_REFRESH_MS = 250;

constexpr size_t FRAME_CAPACITY = 112;
constexpr unsigned long PARTIAL_FRAME_TIMEOUT_MS = 300;
constexpr size_t FEEDBACK_BYTES_PER_PASS = 32;
constexpr unsigned long MOTION_WATCHDOG_MS = 800;

const char STOP_COMMAND[] = "$pwm:0,0,0,0#";
HardwareSerial motorSerial(2);
SMS_STS armServos;
WiFiMulti wifiMulti;
WebSocketsClient webSocket;
WiFiUDP discoveryUdp;

char frameBuffer[FRAME_CAPACITY];
size_t frameLength = 0;
bool receivingFrame = false;
unsigned long lastByteTime = 0;
bool motionActive = false;
unsigned long lastMotionCommandTime = 0;

int homeBase = -1;
int homeShoulderDrive = -1;
int homeShoulderFollow = -1;
int homeElbow = -1;
int homeGripper = -1;
int detectedGripper = -1;
int armVoltage = -1;
bool armReady = false;
bool lightOn = false;
bool webSocketStarted = false;
bool webSocketConnected = false;
unsigned long lastNetworkCheck = 0;
unsigned long lastDiscovery = 0;
int networkSpeed = 400;

enum ArmState {
  ARM_IDLE,
  WAIT_GRIPPER_CCW,
  WAIT_ELBOW_CCW,
  WAIT_SHOULDER_CW,
  WAIT_BASE_CW,
  WAIT_BASE_HOME,
  WAIT_RESTORE,
  WAIT_LOOP_PAUSE
};

ArmState armState = ARM_IDLE;
unsigned long armStateStart = 0;
bool sequenceActive = false;
bool sequenceSingleCycle = false;

enum InspectionState {
  INSPECTION_OFF,
  INSPECTION_SCAN_CCW,
  INSPECTION_SCAN_CW
};

InspectionState inspectionState = INSPECTION_OFF;
unsigned long inspectionStateStart = 0;
unsigned long lastInspectionMotionRefresh = 0;
bool inspectionActive = false;

bool startsWith(const char *text, const char *prefix) {
  while (*prefix != '\0') {
    if (*text++ != *prefix++) return false;
  }
  return true;
}

bool validPosition(int position) { return position >= 0 && position <= 4095; }

void sendEvent(const char *event) {
  Serial.print(event);
  Serial.print("\r\n");
  if (webSocketConnected) webSocket.sendTXT(event);
}

void stopMotors() {
  motorSerial.write(reinterpret_cast<const uint8_t *>(STOP_COMMAND),
                    sizeof(STOP_COMMAND) - 1);
  motorSerial.flush();
  motionActive = false;
}

void turnLightOff() {
  // Active-brake state: both H-bridge outputs are driven to the same level,
  // so a two-wire lamp across A1/A2 has no voltage difference.
  digitalWrite(LIGHT_AIN1_PIN, HIGH);
  digitalWrite(LIGHT_AIN2_PIN, HIGH);
  digitalWrite(LIGHT_PWM_PIN, HIGH);
  lightOn = false;
}

void turnLightOn() {
  // The lamp is polarity-sensitive. Its installed red/black orientation
  // requires the reverse Motor-A polarity.
  digitalWrite(LIGHT_AIN1_PIN, HIGH);
  digitalWrite(LIGHT_AIN2_PIN, LOW);
  digitalWrite(LIGHT_PWM_PIN, HIGH);
  lightOn = true;
}

void sendMotorPwm(int m1, int m2, int m3, int m4) {
  char command[64];
  const int length = snprintf(command, sizeof(command), "$pwm:%d,%d,%d,%d#",
                              m1, m2, m3, m4);
  if (length <= 0 || static_cast<size_t>(length) >= sizeof(command)) return;
  motorSerial.write(reinterpret_cast<const uint8_t *>(command), length);
  motorSerial.flush();
  motionActive = (m1 != 0 || m2 != 0 || m3 != 0 || m4 != 0);
  lastMotionCommandTime = millis();
}

void discoverBackend() {
  const unsigned long now = millis();
  if (now - lastDiscovery < DISCOVERY_INTERVAL_MS) return;
  lastDiscovery = now;
  discoveryUdp.beginPacket(IPAddress(255, 255, 255, 255), DISCOVERY_PORT);
  discoveryUdp.print("SMARTTILLEYE_DISCOVER,8088");
  discoveryUdp.endPacket();
}

bool readBackendDiscovery() {
  int packetSize = discoveryUdp.parsePacket();
  if (packetSize <= 0) return false;
  char packet[64] = {};
  const int length = discoveryUdp.read(packet, sizeof(packet) - 1);
  if (length <= 0 || strncmp(packet, "SMARTTILLEYE_SERVER,", 20) != 0) return false;
  IPAddress remote = discoveryUdp.remoteIP();
  snprintf(websocketHost, sizeof(websocketHost), "%u.%u.%u.%u",
           remote[0], remote[1], remote[2], remote[3]);
  Serial.printf("@ESP:SERVER_DISCOVERED,ip=%s#\r\n", websocketHost);
  return true;
}

void moveServo(uint8_t id, int position) {
  armServos.WritePosEx(id, constrain(position, 0, 4095),
                       ARM_SPEED, ARM_ACCELERATION);
}

void moveArmPose(int basePosition, int liftSteps) {
  const int lift = constrain(liftSteps, -ARM_JOYSTICK_MAX_STEPS,
                             ARM_JOYSTICK_MAX_STEPS);
  moveServo(BASE_ID, constrain(basePosition, 0, 4095));
  moveServo(SHOULDER_DRIVE_ID,
            homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN * lift);
  moveServo(SHOULDER_FOLLOW_ID,
            homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN * lift);
  moveServo(ELBOW_ID, homeElbow + ELBOW_CCW_SIGN * lift);
}

bool moveServoIfSafe(uint8_t id, int position) {
  if (!validPosition(position)) {
    sendEvent("@ARM:ERROR,TARGET_OUT_OF_RANGE#");
    return false;
  }
  moveServo(id, position);
  return true;
}

bool validArmTargets() {
  return validPosition(homeGripper + GRIPPER_CW_SIGN * GRIPPER_OPEN_STEPS) &&
         validPosition(homeGripper - TURN_90_STEPS) &&
         validPosition(homeElbow + ELBOW_CCW_SIGN * TURN_90_STEPS) &&
         validPosition(homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS) &&
         validPosition(homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS) &&
         validPosition(homeBase + BASE_CW_SIGN * TURN_90_STEPS) &&
         validPosition(homeBase - BASE_CW_SIGN * TURN_90_STEPS);
}

bool initializeArm() {
  Serial1.begin(SERVO_BAUD, SERIAL_8N1, SERVO_RX_PIN, SERVO_TX_PIN);
  armServos.pSerial = &Serial1;
  delay(500);

  homeBase = armServos.ReadPos(BASE_ID);
  homeShoulderDrive = armServos.ReadPos(SHOULDER_DRIVE_ID);
  homeShoulderFollow = armServos.ReadPos(SHOULDER_FOLLOW_ID);
  homeElbow = armServos.ReadPos(ELBOW_ID);
  detectedGripper = armServos.ReadPos(GRIPPER_ID);
  // Treat the gripper's power-on pose as its home pose. The real gripper is
  // servo ID 11; ARM_HOME and ARM_GRIPPER_HOME return to this remembered value.
  homeGripper = detectedGripper;
  armVoltage = armServos.ReadVoltage(BASE_ID);

  // One unavailable direction must not disable every otherwise healthy joint.
  // Each manual action and the full sequence validate their own targets.
  return validPosition(homeBase) && validPosition(homeShoulderDrive) &&
         validPosition(homeShoulderFollow) && validPosition(homeElbow) &&
         validPosition(detectedGripper) &&
         armVoltage >= 70 && armVoltage <= 130;
}

void cancelSequence() {
  sequenceActive = false;
  sequenceSingleCycle = false;
  armState = ARM_IDLE;
}

void cancelInspection() {
  inspectionActive = false;
  inspectionState = INSPECTION_OFF;
}

void holdArm() {
  cancelSequence();
  cancelInspection();
  if (!armReady) return;
  const uint8_t ids[] = {BASE_ID, SHOULDER_DRIVE_ID, SHOULDER_FOLLOW_ID,
                         ELBOW_ID, GRIPPER_ID};
  for (uint8_t id : ids) {
    const int position = armServos.ReadPos(id);
    if (validPosition(position)) moveServo(id, position);
  }
  sendEvent("@ARM:STOPPED#");
}

void restoreHome() {
  moveServo(BASE_ID, homeBase);
  moveServo(SHOULDER_DRIVE_ID, homeShoulderDrive);
  moveServo(SHOULDER_FOLLOW_ID, homeShoulderFollow);
  moveServo(ELBOW_ID, homeElbow);
  moveServo(GRIPPER_ID, homeGripper);
}

bool validInspectionTargets() {
  return validPosition(homeElbow + ELBOW_CCW_SIGN * TURN_90_STEPS) &&
         validPosition(homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS) &&
         validPosition(homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS) &&
         validPosition(homeBase - BASE_CW_SIGN * TURN_45_STEPS) &&
         validPosition(homeBase + BASE_CW_SIGN * TURN_45_STEPS);
}

void reportArmStatus() {
  const int latestVoltage = armServos.ReadVoltage(BASE_ID);
  if (latestVoltage >= 0) armVoltage = latestVoltage;
  char status[192];
  snprintf(status, sizeof(status),
           "@ARM:STATUS,ready=%d,sequenceReady=%d,loop=%d,single=%d,state=%d,"
           "base=%d,shoulderA=%d,shoulderB=%d,elbow=%d,"
           "gripper=%d,voltageRaw=%d#",
           armReady ? 1 : 0, validArmTargets() ? 1 : 0,
           sequenceActive ? 1 : 0,
           sequenceSingleCycle ? 1 : 0, static_cast<int>(armState),
           homeBase, homeShoulderDrive, homeShoulderFollow, homeElbow,
           detectedGripper, armVoltage);
  sendEvent(status);
}

void startSequence(bool singleCycle) {
  if (!armReady) {
    sendEvent("@ARM:ERROR,NOT_READY#");
    return;
  }
  if (!validArmTargets()) {
    sendEvent("@ARM:ERROR,SEQUENCE_TARGET_OUT_OF_RANGE#");
    return;
  }
  sequenceActive = true;
  sequenceSingleCycle = singleCycle;
  armState = ARM_IDLE;
  armStateStart = millis();
  sendEvent(singleCycle ? "@ARM:SEQUENCE_ONCE_STARTED#"
                        : "@ARM:SEQUENCE_LOOP_STARTED#");
}

void prepareManualAction() {
  // A manual arm button interrupts only the arm sequence. Vehicle motion is untouched.
  cancelSequence();
  cancelInspection();
}

void startAutoInspection() {
  if (!armReady) {
    sendEvent("@INSPECT:ERROR,NOT_READY#");
    return;
  }
  if (!validInspectionTargets()) {
    sendEvent("@INSPECT:ERROR,TARGET_OUT_OF_RANGE#");
    return;
  }
  cancelSequence();
  inspectionActive = true;
  inspectionState = INSPECTION_SCAN_CCW;
  inspectionStateStart = millis();
  lastInspectionMotionRefresh = 0;
  sendMotorPwm(-networkSpeed, -networkSpeed, -networkSpeed, -networkSpeed);
  moveServo(ELBOW_ID, homeElbow + ELBOW_CCW_SIGN * TURN_90_STEPS);
  moveServo(SHOULDER_DRIVE_ID,
            homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS);
  moveServo(SHOULDER_FOLLOW_ID,
            homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS);
  moveServo(BASE_ID, homeBase - BASE_CW_SIGN * TURN_45_STEPS);
  sendEvent("@INSPECT:AUTO_STARTED#");
}

void switchToManualInspection() {
  cancelInspection();
  cancelSequence();
  stopMotors();
  if (armReady) restoreHome();
  sendEvent("@INSPECT:MANUAL_READY#");
}

void handleArmCommand(const char *command) {
  if (strcmp(command, "@ARM:STATUS#") == 0) {
    reportArmStatus();
    return;
  }
  if (strcmp(command, "@ARM:STOP#") == 0) {
    holdArm();
    return;
  }
  if (strcmp(command, "@ARM:SEQUENCE_LOOP#") == 0) {
    startSequence(false);
    return;
  }
  if (strcmp(command, "@ARM:SEQUENCE_ONCE#") == 0) {
    startSequence(true);
    return;
  }
  if (!armReady) {
    sendEvent("@ARM:ERROR,NOT_READY#");
    return;
  }

  prepareManualAction();
  bool accepted = true;
  int poseBase = -1;
  int poseLift = 0;
  if (sscanf(command, "@ARM:POSE,%d,%d#", &poseBase, &poseLift) == 2) {
    const int shoulderDriveTarget =
        homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN *
            constrain(poseLift, -ARM_JOYSTICK_MAX_STEPS, ARM_JOYSTICK_MAX_STEPS);
    const int shoulderFollowTarget =
        homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN *
            constrain(poseLift, -ARM_JOYSTICK_MAX_STEPS, ARM_JOYSTICK_MAX_STEPS);
    const int elbowTarget =
        homeElbow + ELBOW_CCW_SIGN *
            constrain(poseLift, -ARM_JOYSTICK_MAX_STEPS, ARM_JOYSTICK_MAX_STEPS);
    if (!validPosition(poseBase) || !validPosition(shoulderDriveTarget) ||
        !validPosition(shoulderFollowTarget) || !validPosition(elbowTarget)) {
      sendEvent("@ARM:ERROR,TARGET_OUT_OF_RANGE#");
      accepted = false;
    } else {
      moveArmPose(poseBase, poseLift);
    }
  } else if (strcmp(command, "@ARM:HOME#") == 0) {
    restoreHome();
  } else if (strcmp(command, "@ARM:BASE_CW_90#") == 0) {
    const int requestedTarget =
        homeBase + BASE_CW_SIGN * TURN_90_STEPS;
    const int safeTarget = min(requestedTarget, SERVO_SAFE_MAX_POSITION);
    if (safeTarget != requestedTarget) {
      sendEvent("@ARM:WARN,BASE_CW_LIMITED_BY_POSITION_RANGE#");
    }
    accepted = moveServoIfSafe(BASE_ID, safeTarget);
  } else if (strcmp(command, "@ARM:BASE_CCW_90#") == 0) {
    accepted = moveServoIfSafe(
        BASE_ID, homeBase - BASE_CW_SIGN * TURN_90_STEPS);
  } else if (strcmp(command, "@ARM:BASE_HOME#") == 0) {
    moveServo(BASE_ID, homeBase);
  } else if (strcmp(command, "@ARM:SHOULDER_CW_90#") == 0) {
    const int driveTarget =
        homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS;
    const int followTarget =
        homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS;
    if (!validPosition(driveTarget) || !validPosition(followTarget)) {
      sendEvent("@ARM:ERROR,TARGET_OUT_OF_RANGE#");
      accepted = false;
    } else {
      moveServo(SHOULDER_DRIVE_ID, driveTarget);
      moveServo(SHOULDER_FOLLOW_ID, followTarget);
    }
  } else if (strcmp(command, "@ARM:ELBOW_CCW_90#") == 0) {
    accepted = moveServoIfSafe(
        ELBOW_ID, homeElbow + ELBOW_CCW_SIGN * TURN_90_STEPS);
  } else if (strcmp(command, "@ARM:GRIPPER_CW_90#") == 0) {
    accepted = moveServoIfSafe(
        GRIPPER_ID, homeGripper + GRIPPER_CW_SIGN * TURN_90_STEPS);
  } else if (strcmp(command, "@ARM:GRIPPER_CCW_90#") == 0) {
    accepted = moveServoIfSafe(GRIPPER_ID, homeGripper - TURN_90_STEPS);
  } else if (strcmp(command, "@ARM:GRIPPER_CCW_45#") == 0) {
    const int current = armServos.ReadPos(GRIPPER_ID);
    const int target = current - TURN_90_STEPS / 2;
    if (validPosition(current)) {
      accepted = moveServoIfSafe(GRIPPER_ID, target);
    } else {
      sendEvent("@ARM:ERROR,POSITION_READ_FAILED#");
      accepted = false;
    }
  } else if (strcmp(command, "@ARM:GRIPPER_OPEN#") == 0) {
    accepted = moveServoIfSafe(
        GRIPPER_ID, homeGripper + GRIPPER_CW_SIGN * GRIPPER_OPEN_STEPS);
  } else if (strcmp(command, "@ARM:GRIPPER_HOME#") == 0) {
    moveServo(GRIPPER_ID, homeGripper);
  } else {
    sendEvent("@ARM:ERROR,UNKNOWN_COMMAND#");
    return;
  }
  if (accepted) sendEvent("@ARM:MANUAL_COMMAND_ACCEPTED#");
}

void handleControlFrame() {
  frameBuffer[frameLength] = '\0';

  if (frameBuffer[0] == '$') {
    static const char *const allowed[] = {
        "$pwm:", "$upload:", "$mtype:", "$mphase:",
        "$mline:", "$wdiameter:", "$deadzone:"};
    bool valid = false;
    for (const char *prefix : allowed) {
      if (startsWith(frameBuffer, prefix)) { valid = true; break; }
    }
    if (!valid) return;

    motorSerial.write(reinterpret_cast<const uint8_t *>(frameBuffer), frameLength);
    motorSerial.flush();
    if (startsWith(frameBuffer, "$pwm:")) {
      motionActive = strcmp(frameBuffer, STOP_COMMAND) != 0;
      lastMotionCommandTime = millis();
    }
    return;
  }

  if (strcmp(frameBuffer, "@LIGHT:ON#") == 0) {
    turnLightOn();
    sendEvent("@LIGHT:ON#");
  } else if (strcmp(frameBuffer, "@LIGHT:OFF#") == 0) {
    turnLightOff();
    sendEvent("@LIGHT:OFF#");
  } else if (strcmp(frameBuffer, "@LIGHT:STATUS#") == 0) {
    sendEvent(lightOn ? "@LIGHT:STATUS,ON#" : "@LIGHT:STATUS,OFF#");
  } else if (strcmp(frameBuffer, "@ALL:STOP#") == 0) {
    stopMotors();
    holdArm();
    turnLightOff();
    sendEvent("@ALL:STOPPED#");
  } else if (startsWith(frameBuffer, "@ARM:")) {
    handleArmCommand(frameBuffer);
  }
}

void handleNetworkCommand(String command) {
  command.trim();
  if (command.startsWith("SPEED:")) {
    const int requested = command.substring(6).toInt();
    if (requested >= 100 && requested <= 1200) {
      networkSpeed = requested;
      sendEvent("@ESP:SPEED_ACCEPTED#");
    }
    return;
  }
  if (command == "FWD") {
    // This vehicle's installed motor polarity uses negative PWM for forward.
    sendMotorPwm(-networkSpeed, -networkSpeed, -networkSpeed, -networkSpeed);
  } else if (command == "BACK") {
    sendMotorPwm(networkSpeed, networkSpeed, networkSpeed, networkSpeed);
  } else if (command == "LEFT") {
    const int turnPwm = max(networkSpeed, 700);
    // Match the standalone debug sketch: opposite-side differential turning.
    // M1/M2 are the right side, M3/M4 are the left side.
    sendMotorPwm(-turnPwm, -turnPwm, turnPwm, turnPwm);
  } else if (command == "RIGHT") {
    const int turnPwm = max(networkSpeed, 700);
    sendMotorPwm(turnPwm, turnPwm, -turnPwm, -turnPwm);
  } else if (command == "STOP") {
    cancelInspection();
    stopMotors();
    sendEvent("@ESP:MOTOR_STOPPED#");
  } else if (command == "AUTO_INSPECT_START") {
    startAutoInspection();
  } else if (command == "MANUAL_INSPECT") {
    switchToManualInspection();
  } else if (command == "LIGHT_ON") {
    turnLightOn();
    sendEvent("@LIGHT:ON#");
  } else if (command == "LIGHT_OFF") {
    turnLightOff();
    sendEvent("@LIGHT:OFF#");
  } else if (command == "ALL_STOP") {
    cancelInspection();
    stopMotors();
    holdArm();
    turnLightOff();
    sendEvent("@ALL:STOPPED#");
  } else if (command == "STATUS" || command == "PING") {
    Serial.printf("@ESP:STATUS,wifi=%d,ws=%d,speed=%d,motion=%d,light=%d#\r\n",
                  WiFi.status() == WL_CONNECTED ? 1 : 0,
                  webSocketConnected ? 1 : 0, networkSpeed,
                  motionActive ? 1 : 0, lightOn ? 1 : 0);
    if (webSocketConnected) {
      webSocket.sendTXT(String("@ESP:STATUS,wifi=1,ws=1,speed=") + networkSpeed +
                        ",motion=" + (motionActive ? "1" : "0") +
                        ",light=" + (lightOn ? "1#" : "0#"));
    }
    reportArmStatus();
  } else if (command.startsWith("ARM_")) {
    String framed = "@ARM:" + command.substring(4) + "#";
    handleArmCommand(framed.c_str());
  }
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      stopMotors();
      sendEvent("@ESP:NETWORK_READY#");
      sendEvent(armReady ? "@ARM:READY#" : "@ARM:ERROR,INIT_FAILED#");
      break;
    case WStype_DISCONNECTED:
      webSocketConnected = false;
      webSocketStarted = false;
      websocketHost[0] = '\0';
      stopMotors();
      holdArm();
      turnLightOff();
      break;
    case WStype_TEXT: {
      String command;
      command.reserve(length);
      for (size_t i = 0; i < length; ++i) command += static_cast<char>(payload[i]);
      handleNetworkCommand(command);
      break;
    }
    case WStype_ERROR:
      stopMotors();
      holdArm();
      turnLightOff();
      break;
    default:
      break;
  }
}

void manageNetwork() {
  if (millis() - lastNetworkCheck >= 1000) {
    lastNetworkCheck = millis();
    wifiMulti.run();
    if (WiFi.status() == WL_CONNECTED && !webSocketStarted) {
      readBackendDiscovery();
      discoverBackend();
      if (websocketHost[0] == '\0') return;
      if (WEBSOCKET_TLS) {
        webSocket.beginSSL(websocketHost, WEBSOCKET_PORT, WEBSOCKET_PATH);
      } else {
        webSocket.begin(websocketHost, WEBSOCKET_PORT, WEBSOCKET_PATH);
      }
      webSocket.onEvent(webSocketEvent);
      webSocket.setReconnectInterval(2000);
      webSocket.enableHeartbeat(15000, 3000, 2);
      webSocketStarted = true;
      Serial.printf("@ESP:WIFI_CONNECTED,ip=%s#\r\n", WiFi.localIP().toString().c_str());
    }
  }
  if (WiFi.status() != WL_CONNECTED) {
    websocketHost[0] = '\0';
    webSocketStarted = false;
    webSocketConnected = false;
  }
  if (webSocketStarted) webSocket.loop();
}

void processIncomingByte(char c) {
  lastByteTime = millis();
  if (c == '$' || c == '@') {
    frameLength = 0;
    receivingFrame = true;
    frameBuffer[frameLength++] = c;
    return;
  }
  if (!receivingFrame) return;
  if (frameLength >= FRAME_CAPACITY - 1) {
    frameLength = 0;
    receivingFrame = false;
    return;
  }
  frameBuffer[frameLength++] = c;
  if (c == '#') {
    handleControlFrame();
    frameLength = 0;
    receivingFrame = false;
  }
}

void runArmSequence() {
  if (!sequenceActive) return;
  const unsigned long now = millis();
  const unsigned long elapsed = now - armStateStart;

  switch (armState) {
    case ARM_IDLE:
      moveServo(GRIPPER_ID, homeGripper - TURN_90_STEPS);
      armState = WAIT_GRIPPER_CCW;
      armStateStart = now;
      break;
    case WAIT_GRIPPER_CCW:
      if (elapsed >= ACTION_TIME_MS) {
        moveServo(ELBOW_ID, homeElbow + ELBOW_CCW_SIGN * TURN_90_STEPS);
        armState = WAIT_ELBOW_CCW; armStateStart = now;
      }
      break;
    case WAIT_ELBOW_CCW:
      if (elapsed >= ACTION_TIME_MS) {
        moveServo(SHOULDER_DRIVE_ID,
                  homeShoulderDrive + SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS);
        moveServo(SHOULDER_FOLLOW_ID,
                  homeShoulderFollow - SHOULDER_CW_DRIVE_SIGN * TURN_90_STEPS);
        armState = WAIT_SHOULDER_CW; armStateStart = now;
      }
      break;
    case WAIT_SHOULDER_CW:
      if (elapsed >= ACTION_TIME_MS) {
        moveServo(BASE_ID, homeBase + BASE_CW_SIGN * TURN_90_STEPS);
        armState = WAIT_BASE_CW; armStateStart = now;
      }
      break;
    case WAIT_BASE_CW:
      if (elapsed >= ACTION_TIME_MS) {
        moveServo(BASE_ID, homeBase);
        armState = WAIT_BASE_HOME; armStateStart = now;
      }
      break;
    case WAIT_BASE_HOME:
      if (elapsed >= ACTION_TIME_MS) {
        restoreHome();
        armState = WAIT_RESTORE; armStateStart = now;
      }
      break;
    case WAIT_RESTORE:
      if (elapsed >= RESTORE_TIME_MS) {
        if (sequenceSingleCycle) {
          cancelSequence();
          sendEvent("@ARM:SEQUENCE_ONCE_FINISHED#");
        } else {
          armState = WAIT_LOOP_PAUSE; armStateStart = now;
        }
      }
      break;
    case WAIT_LOOP_PAUSE:
      if (elapsed >= LOOP_PAUSE_MS) {
        armState = ARM_IDLE; armStateStart = now;
      }
      break;
  }
}

void runInspection() {
  if (!inspectionActive) return;

  const unsigned long now = millis();
  if (!motionActive || now - lastInspectionMotionRefresh >= INSPECTION_MOTION_REFRESH_MS) {
    sendMotorPwm(-networkSpeed, -networkSpeed, -networkSpeed, -networkSpeed);
    lastInspectionMotionRefresh = now;
  }

  const unsigned long elapsed = now - inspectionStateStart;

  switch (inspectionState) {
    case INSPECTION_OFF:
      break;
    case INSPECTION_SCAN_CCW:
      if (elapsed >= INSPECTION_SCAN_TIME_MS) {
        moveServo(BASE_ID, homeBase + BASE_CW_SIGN * TURN_45_STEPS);
        inspectionState = INSPECTION_SCAN_CW;
        inspectionStateStart = now;
      }
      break;
    case INSPECTION_SCAN_CW:
      if (elapsed >= INSPECTION_SCAN_TIME_MS) {
        moveServo(BASE_ID, homeBase - BASE_CW_SIGN * TURN_45_STEPS);
        inspectionState = INSPECTION_SCAN_CCW;
        inspectionStateStart = now;
      }
      break;
  }
}

}  // namespace

void setup() {
  pinMode(LIGHT_PWM_PIN, OUTPUT);
  pinMode(LIGHT_AIN1_PIN, OUTPUT);
  pinMode(LIGHT_AIN2_PIN, OUTPUT);
  turnLightOff();
  Serial.begin(PC_BAUD, SERIAL_8N1);
  motorSerial.begin(MOTOR_BAUD, SERIAL_8N1, MOTOR_RX_PIN, MOTOR_TX_PIN);
  delay(250);
  stopMotors();
  armReady = initializeArm();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  wifiMulti.addAP(WIFI_SSID, WIFI_PASSWORD);
  discoveryUdp.begin(DISCOVERY_LOCAL_PORT);
  sendEvent("@ESP:CAR_ARM_READY#");
  sendEvent(armReady ? "@ARM:READY#" : "@ARM:ERROR,INIT_FAILED#");
}

void loop() {
  // PC input has priority so STOP and direction changes cannot be starved by feedback.
  while (Serial.available() > 0) {
    processIncomingByte(static_cast<char>(Serial.read()));
  }

  manageNetwork();

  if (motionActive && millis() - lastMotionCommandTime > MOTION_WATCHDOG_MS) {
    stopMotors();
    sendEvent("@ESP:WATCHDOG_STOP#");
  }

  runArmSequence();
  runInspection();

  for (size_t count = 0; count < FEEDBACK_BYTES_PER_PASS; ++count) {
    if (Serial.available() > 0 || motorSerial.available() <= 0 ||
        Serial.availableForWrite() <= 0) break;
    Serial.write(static_cast<uint8_t>(motorSerial.read()));
  }

  if (receivingFrame && millis() - lastByteTime > PARTIAL_FRAME_TIMEOUT_MS) {
    frameLength = 0;
    receivingFrame = false;
  }
}
