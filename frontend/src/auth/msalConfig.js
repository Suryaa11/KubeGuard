import { LogLevel, PublicClientApplication } from '@azure/msal-browser'

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        if (import.meta.env.DEV) console.log(`[MSAL] ${message}`)
      },
      logLevel: LogLevel.Warning,
    },
  },
}

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', `api://${import.meta.env.VITE_AZURE_CLIENT_ID}/access_as_user`],
}

export const msalInstance = new PublicClientApplication(msalConfig)
