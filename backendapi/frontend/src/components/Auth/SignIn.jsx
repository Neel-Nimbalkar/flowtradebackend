import React from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase';

const SignIn = ({ user }) => {
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign-in error', err);
      alert('Sign-in failed: ' + (err.message || err));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error', err);
    }
  };

  return (
    <div style={{padding:20, textAlign:'center'}}>
      {!user ? (
        <div>
          <h2>Sign in to FlowGrid</h2>
          <button onClick={handleSignIn} style={{padding:'8px 16px',fontSize:16}}>Sign in with Google</button>
          <p style={{marginTop:12,opacity:0.9}}>You must sign in with Google to use this app.</p>
        </div>
      ) : (
        <div>
          <p>Signed in as <strong>{user.displayName || user.email}</strong></p>
          <button onClick={handleSignOut} style={{padding:'6px 12px'}}>Sign out</button>
        </div>
      )}
    </div>
  );
};

export default SignIn;
