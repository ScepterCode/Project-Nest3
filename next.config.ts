import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable experimental features for better performance
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '*.vercel.app',
        // Add your custom domain here when you have one
      ]
    }
  },
  
  // Optimize for production
  output: 'standalone',
  
  // Image optimization
  images: {
    domains: [
      'localhost',
      '*.supabase.co',
      '*.vercel.app'
    ],
    formats: ['image/webp', 'image/avif']
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ];
  },
  
  // Helpful redirects
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/login',
        permanent: true
      },
      {
        source: '/register',
        destination: '/auth/register',
        permanent: true
      }
    ];
  }
};

export default nextConfig;
