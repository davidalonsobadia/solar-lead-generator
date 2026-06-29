export const config = {
  app: {
    name: "Sunscout",
    description: "AI-powered platform for discovering, qualifying, and managing solar installation leads",
  },
  // Google Maps key for the browser. This is the ONLY Google key allowed
  // client-side and must be domain/referrer-restricted in the Google console.
  googleMaps: {
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  },
  api: {
    // Real backend API configuration
    baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    apiKey: process.env.NEXT_PUBLIC_API_KEY || "PI1u-i-6i2pGeIi9q6OOaYYLc7BnjCHzJ58m0NEaIrM",
    endpoints: {
      // Backend API endpoints (v1)
      backend: {
        auth: {
          register: "/api/v1/auth/register",
          login: "/api/v1/auth/login",
          logout: "/api/v1/auth/logout",
          verifyEmail: "/api/v1/auth/verify-email",
          forgotPassword: "/api/v1/auth/forgot-password",
          resetPassword: "/api/v1/auth/reset-password",
          me: "/api/v1/auth/me",
        },
        lists: {
          base: "/api/v1/lists",
          byId: (id: string) => `/api/v1/lists/${id}`,
        },
        tasks: {
          base: "/api/v1/tasks",
          byId: (id: string) => `/api/v1/tasks/${id}`,
        },
        imports: {
          csv: "/api/v1/imports/csv",
          benchmarks: "/api/v1/imports/benchmarks",
        },
        properties: {
          base: "/api/v1/properties",
          byId: (id: string) => `/api/v1/properties/${id}`,
          estimate: (id: string) => `/api/v1/properties/${id}/estimate`,
          leads: (id: string) => `/api/v1/properties/${id}/leads`,
        },
        estimates: {
          byId: (id: string) => `/api/v1/estimates/${id}`,
        },
      },
      // Frontend API routes (proxy to backend)
      auth: {
        register: "/api/auth/register",
        login: "/api/auth/login",
        logout: "/api/auth/logout",
        verifyEmail: "/api/auth/verify-email",
        forgotPassword: "/api/auth/forgot-password",
        resetPassword: "/api/auth/reset-password",
        me: "/api/auth/me",
      },
      lists: {
        base: "/api/lists",
        byId: (id: string) => `/api/lists/${id}`,
      },
      tasks: {
        base: "/api/tasks",
        byId: (id: string) => `/api/tasks/${id}`,
      },
      imports: {
        csv: "/api/imports/csv",
        benchmarks: "/api/imports/benchmarks",
      },
      properties: {
        base: "/api/properties",
        byId: (id: string) => `/api/properties/${id}`,
        estimate: (id: string) => `/api/properties/${id}/estimate`,
        leads: (id: string) => `/api/properties/${id}/leads`,
      },
      estimates: {
        byId: (id: string) => `/api/estimates/${id}`,
      },
    },
  },
  routes: {
    home: "/",
    login: "/login",
    register: "/register",
    verifyEmail: "/verify-email",
    forgotPassword: "/forgot-password",
    resetPassword: "/reset-password",
    lists: "/lists",
    listDetail: (id: string) => `/lists/${id}`,
    // Sunscout app shell screens (tab navigation)
    findLeads: "/find-leads",
    results: "/results",
    rfp: "/rfp",
    adminImport: "/admin/import",
    propertyEstimate: (id: string) => `/properties/${id}/estimate`,
    propertyLeads: (id: string) => `/properties/${id}/leads`,
  },
} as const
