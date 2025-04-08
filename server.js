require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT;

// app.use(
//   cors({
//     origin: [
//       "http://localhost:5173",
//     ],
//     credentials: true,
//   })
// );
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get("/", (req, res) => {
  res.json({ message: "AlumNode API Server is running..." });
});

app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));

app.listen(port, console.log(`Server is running on port ${port}`));
