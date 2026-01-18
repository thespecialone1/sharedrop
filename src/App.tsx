import React, { useEffect, useState } from 'react'
import OwnerApp from './owner/OwnerApp'
import GuestApp from './guest/GuestApp'

function App() {
    const [isElectron, setIsElectron] = useState(false)

    useEffect(() => {
        // Check if electronAPI is available in window
        if (window.electronAPI) {
            setIsElectron(true)
        }
    }, [])

    return isElectron ? <OwnerApp /> : <GuestApp />
}

export default App
