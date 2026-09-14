import React, { useState } from 'react'
import Core from './components/Core'
import OperationsPage from './components/OperationsPage'
import Footer from './components/Footer'

const App = () => {
  const [currentView, setCurrentView] = useState<'market' | 'operations'>('market');

  return (
    <>
      <header className='py-5 border-b border-[#1f2633] bg-[#0f131a]/85 backdrop-blur sticky top-0 z-40 shadow-lg shadow-black/20'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4'>
          <div
            onClick={() => setCurrentView('market')}
            className='cursor-pointer text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[rgb(100,232,250,1)] via-cyan-300 to-indigo-400 tracking-wide hover:opacity-90 transition select-none flex items-center gap-2'
          >
            <span>⚡</span> Gaijin Scalping Assistant
          </div>

          <nav className='flex items-center gap-1.5 bg-[#161c26] p-1 rounded-xl border border-[#273142] shadow-inner'>
            <button
              type='button'
              onClick={() => setCurrentView('market')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                currentView === 'market'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-950/40'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>📈</span> Piyasa Tarayıcısı
            </button>
            <button
              type='button'
              onClick={() => setCurrentView('operations')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                currentView === 'operations'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 shadow-md shadow-indigo-950/40'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>💼</span> İşlemler & Potansiyel Gelirler
            </button>
          </nav>
        </div>
      </header>

      <main>
        {currentView === 'market' ? (
          <Core onNavigateToOperations={() => setCurrentView('operations')} />
        ) : (
          <OperationsPage onBackToDashboard={() => setCurrentView('market')} />
        )}
      </main>

      <Footer />
    </>
  )
}

export default App
