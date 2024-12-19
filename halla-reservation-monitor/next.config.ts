import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://visithalla.jeju.go.kr/:path*'
      }
    ]
  }
}

export default nextConfig