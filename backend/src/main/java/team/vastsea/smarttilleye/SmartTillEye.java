package team.vastsea.smarttilleye;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
@MapperScan("team.vastsea.smarttilleye.dao")
public class SmartTillEye {

    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        SpringApplication.run(SmartTillEye.class, args);
        System.out.println("""
                |----------------------------------
                |       "启动成功！默认端口8088"
                |----------------------------------
                """);
    }

}
