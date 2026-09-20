package team.vastsea.smarttilleye.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();
        //config.setAllowCredentials(true); // 允许发送凭据，雷区
        config.addAllowedOrigin("*"); //允许任意域名跨域访问接口
        config.addAllowedHeader("*"); // 允许所有头部信息
        config.addAllowedMethod("*"); // 允许所有请求方法
        source.registerCorsConfiguration("/**", config); // 应用于所有路径
        return new CorsFilter(source);
    }
}