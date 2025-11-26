import React from 'react'
import { createRoot } from 'react-dom/client'
import WorkflowBuilder from './WorkflowBuilder'
import './workflow_builder.css'

const root = createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <WorkflowBuilder />
  </React.StrictMode>
)
