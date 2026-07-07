/**
 * 网页录音与 WAV 编码辅助工具类
 * 实现将浏览器麦克风的输入流录制并导出为标准 16000Hz、单声道、16-bit PCM WAV 格式，完美兼容阿里云一句话识别。
 */
export class AudioWavRecorder {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private processorNode: ScriptProcessorNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private audioBuffers: Float32Array[] = []
  private recording = false

  constructor() {}

  /**
   * 开始录音
   */
  async start(): Promise<void> {
    if (this.recording) return

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    
    // 强制采样率 16000Hz 最佳适配 ASR
    this.audioContext = new AudioContextClass({ sampleRate: 16000 })
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)

    // 创建 AnalyserNode 用于频谱分析（火土赤金跳动）
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 32 // 很小的 fftSize 产生 16 个频域数据槽
    const bufferLength = this.analyser.frequencyBinCount
    this.dataArray = new Uint8Array(bufferLength) as Uint8Array<ArrayBuffer>

    // 创建处理器节点：缓冲区 4096 字节，单输入通道，单输出通道
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.audioBuffers = []

    this.processorNode.onaudioprocess = (event) => {
      if (!this.recording) return
      // 获取单声道数据
      const inputBuffer = event.inputBuffer.getChannelData(0)
      // 深拷贝一份以防浏览器重用缓冲区
      this.audioBuffers.push(new Float32Array(inputBuffer))
    }

    // 连接节点: source -> analyser -> processor -> destination
    this.sourceNode.connect(this.analyser)
    this.analyser.connect(this.processorNode)
    this.processorNode.connect(this.audioContext.destination)
    this.recording = true
  }

  /**
   * 停止录音并返回标准 WAV 格式 Blob
   */
  async stop(): Promise<Blob> {
    if (!this.recording) {
      throw new Error("录音未开始或已结束")
    }

    this.recording = false

    // 断开节点连接
    if (this.processorNode) {
      this.processorNode.disconnect()
    }
    if (this.analyser) {
      this.analyser.disconnect()
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close()
    }

    // 合并缓冲区
    const totalLength = this.audioBuffers.reduce((acc, buf) => acc + buf.length, 0)
    const mergedBuffer = new Float32Array(totalLength)
    let offset = 0
    for (const buf of this.audioBuffers) {
      mergedBuffer.set(buf, offset)
      offset += buf.length
    }

    // 编码为 Int16 PCM WAV
    const wavBlob = this.encodeWAV(mergedBuffer, 16000)
    
    // 重置状态
    this.audioContext = null
    this.mediaStream = null
    this.processorNode = null
    this.sourceNode = null
    this.analyser = null
    this.dataArray = null
    this.audioBuffers = []

    return wavBlob
  }

  /**
   * 判断是否正在录音
   */
  isRecording(): boolean {
    return this.recording
  }

  /**
   * 获取当前录音的实时音量均方根值 (RMS)，取值范围 0 ~ 1 之间。
   */
  getVolume(): number {
    if (!this.recording || this.audioBuffers.length === 0) return 0
    const lastBuffer = this.audioBuffers[this.audioBuffers.length - 1]
    if (!lastBuffer || lastBuffer.length === 0) return 0
    let sum = 0
    for (let i = 0; i < lastBuffer.length; i++) {
      sum += lastBuffer[i] * lastBuffer[i]
    }
    return Math.sqrt(sum / lastBuffer.length)
  }

  /**
   * 获取当前说话的真实频域频谱特征。
   * 自动将 FFT 频段分析映射合并为 7 个声波波形柱的高度，数值在 10 ~ 100 之间。
   */
  getSpectrum(): number[] {
    if (!this.recording || !this.analyser || !this.dataArray) {
      return Array(7).fill(10)
    }

    this.analyser.getByteFrequencyData(this.dataArray)

    // dataArray 的长度是 fftSize / 2 = 16
    // 我们将其平均分为 7 个区间，计算每个区间的均值并映射到 [10, 100] 之间
    const result: number[] = []
    const step = Math.floor(this.dataArray.length / 7) || 1

    for (let i = 0; i < 7; i++) {
      const startIdx = i * step
      let sum = 0
      let count = 0

      for (let j = 0; j < step && (startIdx + j) < this.dataArray.length; j++) {
        sum += this.dataArray[startIdx + j]
        count++
      }

      const avg = count > 0 ? sum / count : 0
      // 0-255 映射到 10-100，并对低频部分进行稍微增益，使视觉波动更显著
      const boost = i < 3 ? 1.2 : 1.0 // 人声主要集中在低中频
      const val = Math.max(10, Math.min(100, (avg / 255) * 90 * boost + 10))
      result.push(Math.round(val))
    }

    return result
  }

  /**
   * WAV 编码函数
   */
  private encodeWAV(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    /* RIFF identifier */
    this.writeString(view, 0, "RIFF")
    /* file length */
    view.setUint32(4, 36 + samples.length * 2, true)
    /* RIFF type */
    this.writeString(view, 8, "WAVE")
    /* format chunk identifier */
    this.writeString(view, 12, "fmt ")
    /* format chunk length */
    view.setUint32(16, 16, true)
    /* sample format (raw) */
    view.setUint16(20, 1, true)
    /* channel count (mono) */
    view.setUint16(22, 1, true)
    /* sample rate */
    view.setUint32(24, sampleRate, true)
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true)
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true)
    /* bits per sample */
    view.setUint16(34, 16, true)
    /* data chunk identifier */
    this.writeString(view, 36, "data")
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true)

    // 写入 Float32 转化后的 Int16 PCM 数据
    let index = 44
    for (let i = 0; i < samples.length; i++) {
      // 限制幅度在 [-1, 1]
      const s = Math.max(-1, Math.min(1, samples[i]))
      // 转化为 16-bit 有符号整数
      view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      index += 2
    }

    return new Blob([view], { type: "audio/wav" })
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }
}
