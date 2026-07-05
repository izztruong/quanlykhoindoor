import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`API server đang chạy tại http://localhost:${env.port}`);
});
