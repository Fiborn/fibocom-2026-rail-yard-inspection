package team.vastsea.smarttilleye.entity;

import lombok.Data;

@Data
public class JsonResult<T> {
    private int code;
    private String msg;
    private T data;

    public JsonResult() {}

    public JsonResult(int code, String msg, T data) {
        this.code = code;
        this.msg = msg;
        this.data = data;
    }

    public static <T> JsonResult<T> res(int code, String msg, T data) {
        return new JsonResult<>(code, msg, data);
    }


    @Override
    public String toString() {
        return "JsonResult{" +
                "code=" + code +
                ", msg='" + msg + '\'' +
                ", data=" + data +
                '}';
    }
}
