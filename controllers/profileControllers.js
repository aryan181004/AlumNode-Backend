require("dotenv").config();
const pool = require("../config/db");

// Get user profile
const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id || req.user.id;

    // Get user details
    const userQuery = `
      SELECT id, first_name, last_name, email, college_email, is_alumini, created_at
      FROM users
      WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: true, message: "User not found!" });
    }

    // Get profile details
    const profileQuery = `
      SELECT * FROM profiles
      WHERE user_id = $1
    `;
    const profileResult = await pool.query(profileQuery, [userId]);

    // Get connection status if the requester is not the profile owner
    let connectionStatus = null;
    if (req.user && req.user.id !== parseInt(userId)) {
      const connectionQuery = `
        SELECT status FROM connections
        WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)
      `;
      const connectionResult = await pool.query(connectionQuery, [
        req.user.id,
        userId,
      ]);

      if (connectionResult.rowCount > 0) {
        connectionStatus = connectionResult.rows[0].status;
      }
    }

    // Get post count
    const postCountQuery = `
      SELECT COUNT(*) FROM posts
      WHERE user_id = $1
    `;
    const postCountResult = await pool.query(postCountQuery, [userId]);

    // Get connection count
    const connectionCountQuery = `
      SELECT COUNT(*) FROM connections
      WHERE (requester_id = $1 OR addressee_id = $1)
      AND status = 'accepted'
    `;
    const connectionCountResult = await pool.query(connectionCountQuery, [
      userId,
    ]);

    res.status(200).json({
      error: false,
      message: "Profile retrieved successfully",
      data: {
        user: userResult.rows[0],
        profile: profileResult.rowCount > 0 ? profileResult.rows[0] : null,
        stats: {
          posts: parseInt(postCountResult.rows[0].count),
          connections: parseInt(connectionCountResult.rows[0].count),
        },
        connection_status: connectionStatus,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      bio,
      graduation_year,
      current_company,
      current_position,
      profile_picture,
      linkedin_url,
      github_url,
    } = req.body;

    // Check if profile exists
    const checkQuery = `SELECT * FROM profiles WHERE user_id = $1`;
    const checkResult = await pool.query(checkQuery, [userId]);

    let profileResult;

    if (checkResult.rowCount === 0) {
      // Create new profile
      const createQuery = `
        INSERT INTO profiles 
        (user_id, bio, graduation_year, current_company, current_position, profile_picture, linkedin_url, github_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      profileResult = await pool.query(createQuery, [
        userId,
        bio || null,
        graduation_year || null,
        current_company || null,
        current_position || null,
        profile_picture || null,
        linkedin_url || null,
        github_url || null,
      ]);
    } else {
      // Update existing profile
      const updateQuery = `
        UPDATE profiles
        SET 
          bio = COALESCE($1, bio),
          graduation_year = COALESCE($2, graduation_year),
          current_company = COALESCE($3, current_company),
          current_position = COALESCE($4, current_position),
          profile_picture = COALESCE($5, profile_picture),
          linkedin_url = COALESCE($6, linkedin_url),
          github_url = COALESCE($7, github_url),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $8
        RETURNING *
      `;
      profileResult = await pool.query(updateQuery, [
        bio,
        graduation_year,
        current_company,
        current_position,
        profile_picture,
        linkedin_url,
        github_url,
        userId,
      ]);
    }

    res.status(200).json({
      error: false,
      message: "Profile updated successfully",
      data: profileResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Send connection request
const sendConnectionRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const addresseeId = req.params.id;

    if (requesterId === parseInt(addresseeId)) {
      return res
        .status(400)
        .json({ error: true, message: "You cannot connect with yourself!" });
    }

    // Check if addressee exists
    const userQuery = `SELECT * FROM users WHERE id = $1`;
    const userResult = await pool.query(userQuery, [addresseeId]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: true, message: "User not found!" });
    }

    // Check if connection already exists
    const connectionCheckQuery = `
      SELECT * FROM connections
      WHERE (requester_id = $1 AND addressee_id = $2)
      OR (requester_id = $2 AND addressee_id = $1)
    `;
    const connectionCheckResult = await pool.query(connectionCheckQuery, [
      requesterId,
      addresseeId,
    ]);

    if (connectionCheckResult.rowCount > 0) {
      const existingStatus = connectionCheckResult.rows[0].status;

      if (existingStatus === "accepted") {
        return res.status(400).json({
          error: true,
          message: "You are already connected with this user!",
        });
      } else if (existingStatus === "pending") {
        // If the current user is the addressee of the pending request, accept it
        if (connectionCheckResult.rows[0].addressee_id === requesterId) {
          const updateQuery = `
            UPDATE connections
            SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
          `;
          const updateResult = await pool.query(updateQuery, [
            connectionCheckResult.rows[0].id,
          ]);

          return res.status(200).json({
            error: false,
            message: "Connection request accepted!",
            data: updateResult.rows[0],
          });
        }

        return res.status(400).json({
          error: true,
          message: "A connection request already exists!",
        });
      } else if (existingStatus === "rejected") {
        // Allow sending a new request if previous one was rejected
        const updateQuery = `
          UPDATE connections
          SET status = 'pending', requester_id = $1, addressee_id = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `;
        const updateResult = await pool.query(updateQuery, [
          requesterId,
          addresseeId,
          connectionCheckResult.rows[0].id,
        ]);

        return res.status(200).json({
          error: false,
          message: "Connection request sent!",
          data: updateResult.rows[0],
        });
      }
    }

    // Create new connection request
    const createQuery = `
      INSERT INTO connections (requester_id, addressee_id)
      VALUES ($1, $2)
      RETURNING *
    `;
    const createResult = await pool.query(createQuery, [
      requesterId,
      addresseeId,
    ]);

    res.status(201).json({
      error: false,
      message: "Connection request sent!",
      data: createResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Respond to connection request
const respondToConnectionRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const connectionId = req.params.id;
    const { action } = req.body; // 'accept' or 'reject'

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        error: true,
        message: "Invalid action! Use 'accept' or 'reject'.",
      });
    }

    // Check if connection exists and user is the addressee
    const connectionQuery = `
      SELECT * FROM connections
      WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
    `;
    const connectionResult = await pool.query(connectionQuery, [
      connectionId,
      userId,
    ]);

    if (connectionResult.rowCount === 0) {
      return res.status(404).json({
        error: true,
        message:
          "Connection request not found or you're not authorized to respond!",
      });
    }

    // Update connection status
    const updateQuery = `
      UPDATE connections
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const updateResult = await pool.query(updateQuery, [
      action === "accept" ? "accepted" : "rejected",
      connectionId,
    ]);

    res.status(200).json({
      error: false,
      message: `Connection request ${
        action === "accept" ? "accepted" : "rejected"
      }!`,
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Get connection requests
const getConnectionRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get pending requests where user is the addressee
    const pendingQuery = `
      SELECT c.*, 
        u.first_name as requester_first_name, 
        u.last_name as requester_last_name,
        p.profile_picture as requester_profile_picture
      FROM connections c
      JOIN users u ON c.requester_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE c.addressee_id = $1 AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `;
    const pendingResult = await pool.query(pendingQuery, [userId]);

    res.status(200).json({
      error: false,
      message: "Connection requests retrieved successfully",
      data: pendingResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Get user connections
const getUserConnections = async (req, res) => {
  try {
    const userId = req.params.id || req.user.id;

    // Get all accepted connections
    const connectionsQuery = `
      SELECT 
        c.id as connection_id,
        c.created_at as connected_at,
        CASE 
          WHEN c.requester_id = $1 THEN c.addressee_id
          ELSE c.requester_id
        END as user_id,
        u.first_name,
        u.last_name,
        u.is_alumini,
        p.profile_picture,
        p.current_position,
        p.current_company
      FROM connections c
      JOIN users u ON (
        CASE 
          WHEN c.requester_id = $1 THEN c.addressee_id
          ELSE c.requester_id
        END = u.id
      )
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE (c.requester_id = $1 OR c.addressee_id = $1)
      AND c.status = 'accepted'
      ORDER BY c.updated_at DESC
    `;
    const connectionsResult = await pool.query(connectionsQuery, [userId]);

    res.status(200).json({
      error: false,
      message: "Connections retrieved successfully",
      data: connectionsResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

module.exports = {
  getUserProfile,
  updateProfile,
  sendConnectionRequest,
  respondToConnectionRequest,
  getConnectionRequests,
  getUserConnections,
};
