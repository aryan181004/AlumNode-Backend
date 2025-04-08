require("dotenv").config();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

const generateUserToken = async (userId) => {
  try {
    const timestamp = new Date();
    const token = jwt.sign({ id: userId }, process.env.TOKEN_SECRET, {
      expiresIn: "1h",
    });
    const query = `INSERT INTO user_token (token, fk_user, created_at) VALUES ($1, $2, $3)`;
    const queryParams = [token, userId, timestamp];

    await pool.query(query, queryParams);

    return token;
  } catch (err) {
    throw new Error(err);
  }
};

module.exports = generateUserToken;
