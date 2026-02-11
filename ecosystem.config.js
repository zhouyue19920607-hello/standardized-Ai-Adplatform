module.exports = {
    apps: [{
        name: 'ai-platform-backend',
        script: 'python3',
        args: '-m uvicorn server:app --host 0.0.0.0 --port 5000',
        cwd: '/var/www/ai-platform/backend',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            PYTHONUNBUFFERED: '1'
        },
        error_file: '/var/log/pm2/ai-platform-error.log',
        out_file: '/var/log/pm2/ai-platform-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        min_uptime: '10s',
        max_restarts: 10
    }]
};
