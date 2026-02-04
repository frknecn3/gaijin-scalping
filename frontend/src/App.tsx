import React from 'react'
import Core from './components/Core'
import Footer from './components/Footer'

type Props = {}

const App = (props: Props) => {
  return (
    <>
      <header className='h-[10vh] text-center py-10 text-2xl font-bold text-[rgb(100,232,250,1)] sm:text-3xl md:text-4xl'>
        Gaijin Market Scalping Assistant
      </header>
      <Core />
      <Footer />
    </>
  )
}

export default App