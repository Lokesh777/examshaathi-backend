require("dotenv").config();
const app = require("./src/app");
const { connectDB } = require("./src/config/db");

const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === "production";

async function start() {
  const ok = await connectDB();
  if (!ok) {
    console.error("Refusing to start: database connection failed.");
    process.exit(1);
  }

  if (!isProd || process.env.ENABLE_SWAGGER === "true") {
    const swaggerUi = require("swagger-ui-express");
    const swaggerSpec = require("./src/swagger/swagger.config");
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log("Swagger UI enabled at /api-docs");
  }

  app.listen(PORT, () => {
    console.log(`ExamSaathi API listening on PORT ${PORT} (${process.env.NODE_ENV || "development"})`);
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
