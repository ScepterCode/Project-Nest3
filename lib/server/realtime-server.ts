import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { realtimeEnrollmentService } from '@/lib/services/realtime-enrollment';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server: ReturnType<typeof createServer> | null = null;

export async function startRealtimeServer() {
  try {
    await app.prepare();

    // Create HTTP server
    server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url!, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    });

    // Initialize real-time enrollment service
    realtimeEnrollmentService.initialize(server);

    // Start server
    server.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log('> Real-time enrollment service initialized');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await shutdown();
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully');
      await shutdown();
    });

  } catch (error) {
    console.error('Failed to start real-time server:', error);
    process.exit(1);
  }
}

async function shutdown() {
  try {
    // Cleanup real-time service
    await realtimeEnrollmentService.cleanup();
    
    // Close server
    if (server) {
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startRealtimeServer();
}