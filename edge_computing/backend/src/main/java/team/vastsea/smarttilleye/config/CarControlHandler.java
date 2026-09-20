package team.vastsea.smarttilleye.config;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

/** Relays validated controller commands to one ESP32 car connection. */
public class CarControlHandler extends TextWebSocketHandler {
    private static final int MAX_MESSAGE_LENGTH = 160;
    private static final Pattern ALLOWED_COMMAND = Pattern.compile(
            "^(FWD|BACK|LEFT|RIGHT|STOP|ALL_STOP|PING|STATUS|" +
            "AUTO_INSPECT_START|MANUAL_INSPECT|" +
            "LIGHT_ON|LIGHT_OFF|" +
            "ARM_STOP|ARM_HOME|ARM_STATUS|ARM_SEQUENCE_ONCE|ARM_SEQUENCE_LOOP|" +
            "ARM_BASE_CW_90|ARM_BASE_CCW_90|ARM_BASE_HOME|" +
            "ARM_SHOULDER_CW_90|ARM_ELBOW_CCW_90|" +
            "ARM_GRIPPER_CW_90|ARM_GRIPPER_CCW_90|ARM_GRIPPER_CCW_45|" +
            "ARM_GRIPPER_OPEN|ARM_GRIPPER_HOME|" +
            "ARM_POSE,(?:[0-9]{1,3}|[1-3][0-9]{3}|40(?:[0-8][0-9]|9[0-5]))," +
            "-?(?:0|[1-9][0-9]{0,2}|10[01][0-9]|102[0-4])|" +
            "SPEED:(?:[1-9][0-9]{2}|1[01][0-9]{2}|1200))$");

    private final AtomicReference<WebSocketSession> carSession = new AtomicReference<>();
    private final Set<WebSocketSession> controllerSessions = ConcurrentHashMap.newKeySet();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String path = session.getUri() == null ? "" : session.getUri().getPath();
        if (path.contains("/car")) {
            WebSocketSession previous = carSession.getAndSet(session);
            if (previous != null && previous.isOpen() && previous != session) {
                previous.close(CloseStatus.NORMAL.withReason("Replaced by new car connection"));
            }
            broadcastToControllers("@SERVER:CAR_ONLINE#");
            System.out.println("Car connected: " + session.getId());
        } else if (path.contains("/controller")) {
            controllerSessions.add(session);
            safeSend(session, carIsOnline() ? "@SERVER:CAR_ONLINE#" : "@SERVER:CAR_OFFLINE#");
            System.out.println("Controller connected: " + session.getId());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String path = session.getUri() == null ? "" : session.getUri().getPath();
        String payload = message.getPayload().trim();
        if (path.contains("/controller")) {
            if (payload.length() > MAX_MESSAGE_LENGTH || !ALLOWED_COMMAND.matcher(payload).matches()) {
                safeSend(session, "@SERVER:COMMAND_REJECTED#");
                return;
            }
            WebSocketSession car = carSession.get();
            if (car != null && car.isOpen()) {
                safeSend(car, payload);
            } else {
                safeSend(session, "@SERVER:CAR_OFFLINE#");
            }
        } else if (path.contains("/car") && payload.length() <= 1024) {
            broadcastToControllers(payload);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String path = session.getUri() == null ? "" : session.getUri().getPath();
        if (path.contains("/car")) {
            carSession.compareAndSet(session, null);
            broadcastToControllers("@SERVER:CAR_OFFLINE#");
        } else if (path.contains("/controller")) {
            controllerSessions.remove(session);
            if (controllerSessions.isEmpty()) {
                WebSocketSession car = carSession.get();
                if (car != null && car.isOpen()) safeSend(car, "ALL_STOP");
            }
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        if (session.isOpen()) session.close(CloseStatus.SERVER_ERROR);
    }

    private boolean carIsOnline() {
        WebSocketSession car = carSession.get();
        return car != null && car.isOpen();
    }

    private void broadcastToControllers(String payload) {
        for (WebSocketSession controller : controllerSessions) {
            if (!controller.isOpen()) continue;
            try {
                safeSend(controller, payload);
            } catch (IOException ignored) {
                controllerSessions.remove(controller);
            }
        }
    }

    private void safeSend(WebSocketSession session, String payload) throws IOException {
        synchronized (session) {
            if (session.isOpen()) session.sendMessage(new TextMessage(payload));
        }
    }
}
