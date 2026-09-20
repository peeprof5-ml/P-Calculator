require('dotenv').config();
const expressApp = require('express');
const path = require('path');
const cors = require('cors');
const { JsonDB, Config } = require('node-json-db');

const app = expressApp();
const PORT = process.env.PORT || 3000;

// Use environment variable instead of a hardcoded key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Middleware
app.use(cors());
app.use(expressApp.json({ limit: '5000mb' }));
app.use(expressApp.static(path.join(__dirname)));

// Standalone JSON database setup for user management and 30-day tracking
const db = new JsonDB(new Config("p_calculator_db", true, true, '/'));

// In-memory databases
const payments = [];
const ADMIN_SECRET_PASSWORD = "adminpassword123";

// Helper to get 30 days from now
function getExpirationDate() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString();
}

// --- Subscription & Trial Middleware Guard (Auto-Track & Auto-Block) ---
async function autoCheckTrial(req, res, next) {
    const username = req.headers['username'] || req.query.user;
    
    if (!username) {
        return res.status(401).json({ success: false, message: "Unauthorized. Please provide a username." });
    }

    try {
        const user = await db.getData(`/users/${username}`);
        const currentTime = new Date();
        const expirationTime = new Date(user.expires_at);

        // AUTO-BLOCK CHECK: If 30 days have passed and subscription is not active
        if (currentTime > expirationTime && user.subscription_status !== 'active') {
            await db.push(`/users/${username}/subscription_status`, 'expired');
            return res.status(403).json({
                success: false,
                error: "Trial expired",
                message: "Your 30-day access has ended. Please select a subscription plan to continue.",
                redirectUrl: "/subscription-plans.html"
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(404).json({ success: false, message: "User not found in database." });
    }
}

// --- User Registration (Auto-Starts 30-Day Countdown) ---
app.post('/api/register', async (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ success: false, message: "Username is required." });
    }

    try {
        let userExists = false;
        try {
            await db.getData(`/users/${username}`);
            userExists = true;
        } catch (e) {
            userExists = false;
        }

        if (userExists) {
            return res.status(400).json({ success: false, message: "Username already exists." });
        }

        const expiresAt = getExpirationDate();
        await db.push(`/users/${username}`, {
            username: username,
            created_at: new Date().toISOString(),
            expires_at: expiresAt,
            subscription_status: 'trial'
        });

        res.json({
            success: true,
            message: "Account created with a 30-day trial clock!",
            username: username,
            expires_at: expiresAt
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: "Internal server error during registration." });
    }
});

// --- Payment & Admin API Endpoints ---

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_SECRET_PASSWORD) {
        res.json({ success: true, message: "Admin authenticated." });
    } else {
        res.status(401).json({ success: false, message: "Invalid password." });
    }
});

app.post('/api/payments/submit', async (req, res) => {
    try {
        const username = req.body.user;
        const newPayment = {
            id: Date.now(),
            user: username,
            plan: req.body.plan,
            amount: req.body.amount,
            screenshot: req.body.screenshot,
            status: 'Pending',
            date: new Date().toISOString()
        };
        payments.push(newPayment);

        try {
            const newExpiresAt = getExpirationDate();
            await db.push(`/users/${username}/expires_at`, newExpiresAt);
            await db.push(`/users/${username}/subscription_status`, 'active');
        } catch (err) {
            console.log("Could not auto-update user database record directly from payment.");
        }

        res.json({ success: true, message: "Payment proof submitted successfully and access renewed!" });
    } catch (error) {
        console.error('Error saving payment:', error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

app.get('/api/admin/payments', (req, res) => {
    res.json({ success: true, data: payments });
});

app.post('/api/admin/payments/:id/status', (req, res) => {
    const paymentId = parseInt(req.params.id);
    const { status } = req.body;
    const payment = payments.find(p => p.id === paymentId);
    if (payment) {
        payment.status = status;
        res.json({ success: true, message: `Payment status updated to ${status}.` });
    } else {
        res.status(404).json({ success: false, message: "Payment record not found." });
    }
});

// --- Live Groq AI Chat Integration Endpoint ---

app.post('/api/ai/chat', async (req, res) => {
    const { prompt, subject } = req.body;
    
    try {
        const systemPrompt = `You are an expert, precise AI mentor specializing in ${subject || 'General Science'}. Your goal is to provide detailed, highly accurate, and straight-to-the-point answers without fluff, filler words, or unnecessary introductions. Get straight to the core explanation, facts, or solution. For chemistry requests like balancing equations, provide the correct fully balanced chemical equation immediately. Do not use any markdown formatting symbols such as asterisks (*) or hash symbols (#). Keep the text clean and direct.`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt || 'Hello' }
                ],
                temperature: 0.2,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
            const replyText = data.choices[0].message.content;
            res.json({ 
                success: true, 
                reply: replyText, 
                response: replyText, 
                message: replyText, 
                answer: replyText 
            });
        } else {
            console.error('Groq API Error Response:', data);
            res.status(500).json({ success: false, reply: "Received invalid response format from Groq." });
        }
    } catch (error) {
        console.error('Groq AI fetch connection error:', error);
        res.status(500).json({ success: false, reply: "Error connecting to Groq AI service." });
    }
});

// --- Dedicated AI Problem Solver Endpoint ---

app.post('/api/ai/solver', async (req, res) => {
    const { prompt, subject } = req.body;
    
    try {
        const solverSystemPrompt = `You are an expert problem solver specializing in ${subject || 'Mathematics and Science'}. Analyze the given input problem accurately, calculate or determine the exact correct final answer. 

CRITICAL INSTRUCTIONS FOR SOLVER:
- Provide a detailed, clear, step-by-step breakdown of how the solution is derived.
- For chemistry equation balancing or reactions, explicitly provide the step-by-step coefficient analysis followed by the complete balanced chemical equation clearly highlighted.
- Keep the response straight to the point, highly structured, and entirely in plain text without any fluff or pleasantries.
- Do not use any markdown formatting symbols such as asterisks (*) or hash symbols (#).`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    { role: 'system', content: solverSystemPrompt },
                    { role: 'user', content: prompt || 'Solve this problem' }
                ],
                temperature: 0.1,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
            const replyText = data.choices[0].message.content;
            res.json({ 
                success: true, 
                reply: replyText, 
                response: replyText, 
                message: replyText, 
                answer: replyText 
            });
        } else {
            console.error('Groq Solver API Error Response:', data);
            res.status(500).json({ success: false, reply: "Received invalid response format from Groq Solver." });
        }
    } catch (error) {
        console.error('Groq Solver fetch connection error:', error);
        res.status(500).json({ success: false, reply: "Error connecting to Groq Solver service." });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

