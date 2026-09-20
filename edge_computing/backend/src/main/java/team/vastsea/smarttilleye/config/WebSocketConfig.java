package team.vastsea.smarttilleye.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    @Bean
    public CarControlHandler carControlHandler() {
        return new CarControlHandler();
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new SignalingHandler(), "/signaling").setAllowedOrigins("*");
        registry.addHandler(carControlHandler(), "/ws/car").setAllowedOrigins("*");
        registry.addHandler(carControlHandler(), "/ws/controller").setAllowedOrigins("*");
    }
}
