require("dotenv").config();
const pool = require("../config/db");

// Create a new post
const createPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, image_url, post_type } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: true, message: "Content is required!" });
    }
    
    // Validate post type
    const validPostTypes = ['general', 'job', 'internship', 'achievement'];
    const finalPostType = post_type && validPostTypes.includes(post_type) ? post_type : 'general';
    
    // Create post
    const postQuery = `
      INSERT INTO posts (user_id, content, image_url, post_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const postResult = await pool.query(postQuery, [
      userId,
      content,
      image_url || null,
      finalPostType
    ]);
    
    // If it's a job or internship post, add additional details
    if (finalPostType === 'job' || finalPostType === 'internship') {
      const { 
        company_name, 
        position, 
        location, 
        job_type, 
        description, 
        application_url, 
        deadline 
      } = req.body;
      
      if (!company_name || !position) {
        // Delete the post if required job details are missing
        await pool.query('DELETE FROM posts WHERE id = $1', [postResult.rows[0].id]);
        return res.status(400).json({ 
          error: true, 
          message: "Company name and position are required for job/internship posts!" 
        });
      }
      
      const jobQuery = `
        INSERT INTO job_posts (
          post_id, company_name, position, location, job_type, description, application_url, deadline
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const jobResult = await pool.query(jobQuery, [
        postResult.rows[0].id,
        company_name,
        position,
        location || null,
        job_type || null,
        description || null,
        application_url || null,
        deadline || null
      ]);
      
      postResult.rows[0].job_details = jobResult.rows[0];
    }
    
    res.status(201).json({
      error: false,
      message: "Post created successfully",
      data: postResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Get all posts (with pagination)
const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const postType = req.query.type; // Filter by post type
    
    // Build query based on filters
    let postsQuery = `
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.is_alumini,
        pr.profile_picture,
        pr.current_position,
        pr.current_company,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) as user_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles pr ON u.id = pr.user_id
    `;
    
    const queryParams = [req.user.id];
    let paramIndex = 2;
    
    if (postType) {
      postsQuery += ` WHERE p.post_type = $${paramIndex}`;
      queryParams.push(postType);
      paramIndex++;
    }
    
    // Add ordering and pagination
    postsQuery += `
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);
    
    const postsResult = await pool.query(postsQuery, queryParams);
    
    // Get job details for job/internship posts
    const postIds = postsResult.rows
      .filter(post => ['job', 'internship'].includes(post.post_type))
      .map(post => post.id);
    
    let jobDetails = {};
    if (postIds.length > 0) {
      const jobQuery = `
        SELECT * FROM job_posts
        WHERE post_id = ANY($1::bigint[])
      `;
      const jobResult = await pool.query(jobQuery, [postIds]);
      
      jobDetails = jobResult.rows.reduce((acc, job) => {
        acc[job.post_id] = job;
        return acc;
      }, {});
    }
    
    // Add job details to posts
    const posts = postsResult.rows.map(post => {
      if (['job', 'internship'].includes(post.post_type)) {
        post.job_details = jobDetails[post.id] || null;
      }
      return post;
    });
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) FROM posts
      ${postType ? 'WHERE post_type = $1' : ''}
    `;
    const countResult = await pool.query(
      countQuery, 
      postType ? [postType] : []
    );
    
    const totalPosts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalPosts / limit);
    
    res.status(200).json({
      error: false,
      message: "Posts retrieved successfully",
      data: {
        posts,
        pagination: {
          total: totalPosts,
          page,
          limit,
          total_pages: totalPages,
          has_more: page < totalPages
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Get a single post by ID
const getPostById = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    
    const postQuery = `
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.is_alumini,
        pr.profile_picture,
        pr.current_position,
        pr.current_company,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
        EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) as user_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles pr ON u.id = pr.user_id
      WHERE p.id = $2
    `;
    const postResult = await pool.query(postQuery, [userId, postId]);
    
    if (postResult.rowCount === 0) {
      return res.status(404).json({ error: true, message: "Post not found!" });
    }
    
    const post = postResult.rows[0];
    
    // Get job details if it's a job/internship post
    if (['job', 'internship'].includes(post.post_type)) {
      const jobQuery = `
        SELECT * FROM job_posts
        WHERE post_id = $1
      `;
      const jobResult = await pool.query(jobQuery, [postId]);
      
      if (jobResult.rowCount > 0) {
        post.job_details = jobResult.rows[0];
      }
    }
    
    // Get comments
    const commentsQuery = `
      SELECT 
        c.*,
        u.first_name,
        u.last_name,
        pr.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN profiles pr ON u.id = pr.user_id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `;
    const commentsResult = await pool.query(commentsQuery, [postId]);
    
    post.comments = commentsResult.rows;
    
    res.status(200).json({
      error: false,
      message: "Post retrieved successfully",
      data: post
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Update a post
const updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const { content, image_url } = req.body;
    
    // Check if post exists and belongs to user
    const checkQuery = `
      SELECT * FROM posts
      WHERE id = $1 AND user_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [postId, userId]);
    
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ 
        error: true, 
        message: "Post not found or you don't have permission to update it!" 
      });
    }
    
    // Update post
    const updateQuery = `
      UPDATE posts
      SET 
        content = COALESCE($1, content),
        image_url = COALESCE($2, image_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    const updateResult = await pool.query(updateQuery, [
      content,
      image_url,
      postId
    ]);
    
    res.status(200).json({
      error: false,
      message: "Post updated successfully",
      data: updateResult.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Delete a post
const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    
    // Check if post exists and belongs to user
    const checkQuery = `
      SELECT * FROM posts
      WHERE id = $1 AND user_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [postId, userId]);
    
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ 
        error: true, 
        message: "Post not found or you don't have permission to delete it!" 
      });
    }
    
    // Delete post (cascade will handle related records)
    const deleteQuery = `
      DELETE FROM posts
      WHERE id = $1
    `;
    await pool.query(deleteQuery, [postId]);
    
    res.status(200).json({
      error: false,
      message: "Post deleted successfully"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Like/unlike a post
const toggleLike = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    
    // Check if post exists
    const postQuery = `SELECT * FROM posts WHERE id = $1`;
    const postResult = await pool.query(postQuery, [postId]);
    
    if (postResult.rowCount === 0) {
      return res.status(404).json({ error: true, message: "Post not found!" });
    }
    
    // Check if user already liked the post
    const likeQuery = `
      SELECT * FROM likes
      WHERE post_id = $1 AND user_id = $2
    `;
    const likeResult = await pool.query(likeQuery, [postId, userId]);
    
    let message;
    
    if (likeResult.rowCount > 0) {
      // Unlike the post
      const unlikeQuery = `
        DELETE FROM likes
        WHERE post_id = $1 AND user_id = $2
      `;
      await pool.query(unlikeQuery, [postId, userId]);
      message = "Post unliked successfully";
    } else {
      // Like the post
      const likeInsertQuery = `
        INSERT INTO likes (post_id, user_id)
        VALUES ($1, $2)
      `;
      await pool.query(likeInsertQuery, [postId, userId]);
      message = "Post liked successfully";
    }
    
    // Get updated like count
    const countQuery = `
      SELECT COUNT(*) FROM likes
      WHERE post_id = $1
    `;
    const countResult = await pool.query(countQuery, [postId]);
    
    res.status(200).json({
      error: false,
      message,
      data: {
        like_count: parseInt(countResult.rows[0].count),
        user_liked: likeResult.rowCount === 0 // If it was 0 before, now it's liked
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Add a comment to a post
const addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: true, message: "Comment content is required!" });
    }
    
    // Check if post exists
    const postQuery = `SELECT * FROM posts WHERE id = $1`;
    const postResult = await pool.query(postQuery, [postId]);
    
    if (postResult.rowCount === 0) {
      return res.status(404).json({ error: true, message: "Post not found!" });
    }
    
    // Add comment
    const commentQuery = `
      INSERT INTO comments (post_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const commentResult = await pool.query(commentQuery, [postId, userId, content]);
    
    // Get user details for the response
    const userQuery = `
      SELECT 
        u.first_name,
        u.last_name,
        p.profile_picture
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.id = $1
    `;
    const userResult = await pool.query(userQuery, [userId]);
    
    const comment = {
      ...commentResult.rows[0],
      ...userResult.rows[0]
    };
    
    res.status(201).json({
      error: false,
      message: "Comment added successfully",
      data: comment
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

// Delete a comment
const deleteComment = async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user.id;
    
    // Check if comment exists and belongs to user
    const checkQuery = `
      SELECT * FROM comments
      WHERE id = $1 AND user_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [commentId, userId]);
    
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ 
        error: true, 
        message: "Comment not found or you don't have permission to delete it!" 
      });
    }
    
    // Delete comment
    const deleteQuery = `
      DELETE FROM comments
      WHERE id = $1
    `;
    await pool.query(deleteQuery, [commentId]);
    
    res.status(200).json({
      error: false,
      message: "Comment deleted successfully"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
  deleteComment
};