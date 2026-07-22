require("dotenv").config();
const app = require("./src/app");
const { connectDB } = require("./src/config/db")
const PORT = process.env.PORT || 5000;

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

connectDB()

app.listen(PORT, () => {
  console.log(`Server created successfully at PORT ${PORT}`);
});
