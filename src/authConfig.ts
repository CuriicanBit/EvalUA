import { Configuration, PopupRequest } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: "0da2095a-c349-4c55-9aa8-1a513dcdb359", 
    authority: "https://login.microsoftonline.com/60dac1b9-6047-489a-a134-b070386cccf7", 
    redirectUri: window.location.origin, // Esto se adapta automáticamente a la URL de AI Studio
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const loginRequest: PopupRequest = {
  scopes: ["User.Read"],
};