# Math Game Backend

Backend API for the Math Monster Battle Game.

## Setup on Render

1. **Create a PostgreSQL Database on Render:**
   - Go to your Render dashboard
   - Click "New +" and select "PostgreSQL"
   - Name it "mathgame-db" (or your preference)
   - Choose the free tier
   - Click "Create Database"
   - Wait for it to be created and copy the "Internal Database URL"

2. **Create a Web Service on Render:**
   - Click "New +" and select "Web Service"
   - Connect your GitHub account if not already connected
   - Create a new repository and push this backend code to it:
     ```bash
     cd /Users/churryboy/QStore/mathgame-backend
     git init
     git add .
     git commit -m "Initial backend commit"
     git branch -M main
     git remote add origin YOUR_GITHUB_REPO_URL
     git push -u origin main
     ```
   - Select the repository in Render
   - Configure the service:
     - Name: mathgame-backend
     - Region: Choose nearest to you
     - Branch: main
     - Runtime: Node
     - Build Command: `npm install`
     - Start Command: `npm start`

3. **Add Environment Variables in Render:**
   Go to the Environment tab and add:
   - `DATABASE_URL`: Paste the Internal Database URL from step 1
   - `JWT_SECRET`: Generate a secure random string (e.g., use `openssl rand -base64 32`)
   - `NODE_ENV`: production

4. **Deploy:**
   - Click "Create Web Service"
   - Wait for the build and deployment to complete
   - Your backend will be available at: `https://your-service-name.onrender.com`

## API Endpoints

- `POST /api/register` - Register a new user
- `POST /api/login` - Login user
- `POST /api/stats/update` - Update user stats
- `GET /api/leaderboard/:grade?` - Get leaderboard (optional grade filter)
- `GET /api/users` - Get all users

## Local Development

1. Install PostgreSQL locally
2. Create a database: `createdb mathgame`
3. Update `.env` with your local database URL
4. Run: `npm install`
5. Run: `npm start`

## Frontend Integration

Update your frontend to use the Render backend URL instead of Google Sheets:
- Replace Google Sheets API calls with fetch requests to your backend
- Store the JWT token in localStorage after login/register
- Include the token in Authorization header for authenticated requests
