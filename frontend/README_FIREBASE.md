Setup: Firebase Google Sign-In (frontend)

1) Install the Firebase SDK in the frontend:

```powershell
cd frontend
npm install firebase
```

2) Create a Firebase Web app in the Firebase console and enable Google Authentication.

3) Add the Firebase config values as Vite env vars in `frontend/.env` (create if missing):

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

(Using `VITE_` prefix exposes them to the client in a Vite app.)

4) Run the frontend dev server:

```powershell
cd frontend
npm run dev
```

5) When visiting the app, the Sign in with Google button will be shown until a user signs in. After sign-in, the app UI will be available.

Notes:
- This implementation uses `onAuthStateChanged` to gate the entire React app. If you want to protect specific routes only, modify `main.jsx` accordingly.
- For production, consider restricting allowed OAuth redirect origins in Firebase, and use stronger session rules as needed.
