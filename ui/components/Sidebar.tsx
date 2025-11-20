import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { LucideBot, LucideChartColumn, LucideSettings, LucideShieldBan, Menu } from 'lucide-react';

const Sidebar = ({ shop, host }: { shop: string, host: string }) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    return (
        <>
            {/* Hamburger Icon for mobile */}
            <button
                className="block xl:hidden fixed top-4 left-4 z-50 bg-white border border-slate-200 rounded-md p-2 shadow"
                onClick={() => setOpen(true)}
                aria-label="Open sidebar"
            >
                <Menu size={24} className="text-slate-700" />
            </button>

            {/* Sidebar Drawer Overlay for mobile */}
            <div
                className={`fixed inset-0 z-40 bg-black bg-opacity-30 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} xl:hidden`}
                onClick={() => setOpen(false)}
            />
            <aside
                className={`bg-white flex flex-col border-r border-slate-200 w-64 min-w-0 max-w-full h-full min-h-screen fixed top-0 left-0 z-50 transform transition-transform duration-200
                ${open ? 'translate-x-0' : '-translate-x-full'} xl:translate-x-0 xl:static xl:h-auto xl:flex xl:w-80`}
                style={{ minHeight: '100vh' }}
            >
                {/* Logo Section */}
                <div className='flex flex-row gap-2 border-b border-slate-200 p-6 items-center'>
                    <Image src={"/logo.png"} alt="fraudguard-logo" width={40} height={40} />
                    <div className='flex flex-col justify-center ml-1'>
                        <span className='text-slate-900 font-bold text-lg'>FraudGuard</span>
                        <span className='text-slate-500 text-xs font-medium'>Fraud Protection</span>
                    </div>
                </div>

                {/* Navigation Section */}
                <div className="flex-1 px-6 py-6 space-y-2 text-sm">
                    <Link
                        href={`/dashboard?shop=${shop}&host=${host}`}
                        className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                            router.pathname === '/dashboard' || router.pathname === '/'
                                ? 'bg-blue-50 border border-blue-200 text-blue-700 font-semibold'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-blue-700'
                        }`}
                    >
                        <LucideChartColumn size={15} />
                        <span className="ml-3 font-medium">Dashboard</span>
                    </Link>

                    <Link
                        href={`/automation?shop=${shop}&host=${host}`}
                        className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                            router.pathname === '/automation'
                                ? 'bg-blue-50 border border-blue-200 text-blue-700 font-semibold'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-blue-700'
                        }`}
                    >
                        <LucideBot size={15} />
                        <span className="ml-3 font-medium">Automation</span>
                    </Link>

                    <Link
                        href={`/access?shop=${shop}&host=${host}`}
                        className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                            router.pathname === '/access'
                                ? 'bg-blue-50 border border-blue-200 text-blue-700 font-semibold'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-blue-700'
                        }`}
                    >
                        <LucideShieldBan size={15} />
                        <span className="ml-3 font-medium">Access</span>
                    </Link>

                    <Link
                        href={`/settings?shop=${shop}&host=${host}`}
                        className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                            router.pathname === '/settings'
                                ? 'bg-blue-50 border border-blue-200 text-blue-700 font-semibold'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-blue-700'
                        }`}
                    >
                        <LucideSettings size={15} />
                        <span className="ml-3 font-medium">Settings</span>
                    </Link>
                </div>
            </aside>
        </>
    )
}

export default Sidebar