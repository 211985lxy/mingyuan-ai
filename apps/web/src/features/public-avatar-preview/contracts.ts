export interface PreviewablePublicAvatar {
  id: string
  name: string
  coverUrl: string
  gender?: string
  previewVirtualmanId?: string
  source?: "public" | "mine"
}

export interface PreviewablePublicVoice {
  id: string
  name: string
  gender?: string
  coverUrl?: string
  demoUrl?: string
  langs?: string[]
}
