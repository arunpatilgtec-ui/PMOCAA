'use client'

import { Card, CardContent } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export default function DocumentsPage() {
  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold">Documents</h1>
      <Card>
        <CardContent className="p-12 flex flex-col items-center text-center">
          <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold mb-2">Document Management</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Upload and manage PDFs, Excel files, PowerPoint presentations, and images.
            Attach documents to projects, workstreams, and tasks from their respective pages.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
