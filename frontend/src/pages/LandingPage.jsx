const handleSignIn = async () => {
  try {
    await msalInstance.loginRedirect(loginRequest)
  } catch (err) {
    if (err.errorCode === 'interaction_in_progress') {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('msal.'))
        .forEach((key) => sessionStorage.removeItem(key))
      await msalInstance.loginRedirect(loginRequest)
    } else {
      console.error('[LandingPage] Login error:', err)
    }
  }
}