package team.vastsea.smarttilleye.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;

/** Replies to ESP32 discovery broadcasts so the car does not need a fixed PC IP. */
@Component
public class LanDiscoveryService {
    private static final int PORT = 4210;
    private static final String REQUEST = "SMARTTILLEYE_DISCOVER";
    private volatile boolean running;
    private DatagramSocket socket;
    private Thread worker;

    @PostConstruct
    public void start() {
        running = true;
        worker = new Thread(this::listen, "smarttilleye-lan-discovery");
        worker.setDaemon(true);
        worker.start();
    }

    private void listen() {
        try (DatagramSocket server = new DatagramSocket(PORT, InetAddress.getByName("0.0.0.0"))) {
            socket = server;
            byte[] buffer = new byte[128];
            while (running) {
                DatagramPacket request = new DatagramPacket(buffer, buffer.length);
                server.receive(request);
                String message = new String(request.getData(), request.getOffset(),
                        request.getLength(), StandardCharsets.US_ASCII);
                if (!message.startsWith(REQUEST)) continue;
                byte[] response = "SMARTTILLEYE_SERVER,8088".getBytes(StandardCharsets.US_ASCII);
                DatagramPacket reply = new DatagramPacket(response, response.length,
                        request.getAddress(), request.getPort());
                server.send(reply);
            }
        } catch (Exception exception) {
            if (running) System.err.println("LAN discovery stopped: " + exception.getMessage());
        }
    }

    @PreDestroy
    public void stop() {
        running = false;
        if (socket != null) socket.close();
    }
}
