import AVFoundation
import Foundation

struct Options {
  var voiceIdentifier = ""
  var rate: Float = 0.46
  var output = ""
  var text = ""
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("Speech synthesis error: \(message)\n".utf8))
  exit(1)
}

func parseOptions() -> Options {
  var options = Options()
  let arguments = Array(CommandLine.arguments.dropFirst())
  var index = 0

  while index < arguments.count {
    guard index + 1 < arguments.count else { fail("missing value for \(arguments[index])") }
    let value = arguments[index + 1]
    switch arguments[index] {
    case "--voice": options.voiceIdentifier = value
    case "--rate": options.rate = Float(value) ?? options.rate
    case "--output": options.output = value
    case "--text": options.text = value
    default: fail("unknown option \(arguments[index])")
    }
    index += 2
  }

  guard !options.voiceIdentifier.isEmpty else { fail("--voice is required") }
  guard !options.output.isEmpty else { fail("--output is required") }
  guard !options.text.isEmpty else { fail("--text is required") }
  return options
}

let options = parseOptions()
guard let voice = AVSpeechSynthesisVoice(identifier: options.voiceIdentifier) else {
  fail("voice is not installed: \(options.voiceIdentifier)")
}

let outputURL = URL(fileURLWithPath: options.output)
try? FileManager.default.removeItem(at: outputURL)

let utterance = AVSpeechUtterance(string: options.text)
utterance.voice = voice
utterance.rate = min(max(options.rate, 0.35), 0.65)
utterance.pitchMultiplier = 1.0
utterance.volume = 1.0

let synthesizer = AVSpeechSynthesizer()
var audioFile: AVAudioFile?
var finished = false
var synthesisError: Error?

synthesizer.write(utterance) { buffer in
  guard let pcmBuffer = buffer as? AVAudioPCMBuffer else { return }
  if pcmBuffer.frameLength == 0 {
    audioFile = nil
    finished = true
    return
  }

  do {
    if audioFile == nil {
      audioFile = try AVAudioFile(forWriting: outputURL, settings: pcmBuffer.format.settings)
    }
    try audioFile?.write(from: pcmBuffer)
  } catch {
    synthesisError = error
    finished = true
  }
}

let deadline = Date().addingTimeInterval(60)
while !finished && Date() < deadline {
  RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
}

if let synthesisError { fail(synthesisError.localizedDescription) }
guard finished else { fail("timed out") }
guard FileManager.default.fileExists(atPath: options.output) else { fail("no audio was generated") }
