module.exports = {
  apps: [
    {
      name: "project-service",
      cwd: "./project-service",
      script: "server.js",
      env: {
        PORT: 3001
      }
    },
    {
      name: "gateway",
      cwd: "./gateway",
      script: "server.js",
      env: {
        PORT: 8080,
        PROJECT_SERVICE_URL: "http://localhost:3001",
        WATCHER_SERVICE_URL: "http://localhost:3002",
        ANALYSIS_SERVICE_URL: "http://localhost:3003"
      }
    }
  ]
};