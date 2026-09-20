package team.vastsea.smarttilleye.entity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public class TableResult<T> extends JsonResult<T>{
    private int count;

    public TableResult() {}

    public TableResult(int code, String msg, int count, T data) {
        super(code, msg, data);
        this.count = count;
    }

    public static <T> TableResult<T> res(int code, String msg, int count, T data) {
        return new TableResult<>(code, msg, count, data);
    }

    @Override
    public String toString() {
        return "TableResult{" +
                "code=" + getCode() +
                ", msg='" + getMsg() + '\'' +
                ", count=" + count +
                ", data=" + getData() +
                '}';
    }
}
