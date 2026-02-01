import React, { useEffect, useState } from 'react'
import OwnerApp from './owner/OwnerApp'
import GuestApp from './guest/GuestApp'

function App() {
    const [isElectron, setIsElectron] = useState<null | boolean>(null)

    useEffect(() => {
        if (window.electronAPI) {
            setIsElectron(true)
        } else {
            setIsElectron(false)
        }
    }, [])

    if (isElectron === null) {
        return null
    }

    return isElectron ? <OwnerApp /> : <GuestApp />
}

export default App
