package team.vastsea.smarttilleye.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Decision {
    private Integer id;
    private String message;
    private String result;
    private Integer status;
    @Override
    public String toString() {
        return "Decision{" +
                "id=" + id +
                ", message=" + message +
                ", result=" + result +
                ", status='" + status + '\'' +
                '}';
    }
}