'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';

const navItems = [
  { name: 'Chat', href: '/' },
  { name: 'Profile', href: '/profile' },
  { name: 'Food Logs', href: '/food-logs' },
  { name: 'Exercise Logs', href: '/exercise-logs' },
  { name: 'Stats', href: '/stats' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col w-64 h-screen bg-gray-100 dark:bg-gray-800 p-4 border-r border-gray-200 dark:border-gray-700">
      <div className="mb-8">
        {/* Placeholder for Logo or App Name */}
        <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-white">
          DailyBalance
        </Link>
      </div>
      <ul className="space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.name}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-white'
                    : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                )}
              >
                {/* Add icons here if desired */}
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Optional: Add user profile/logout section at the bottom */}
    </nav>
  );
}
