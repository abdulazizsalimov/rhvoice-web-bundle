#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <sstream>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "RHVoice.h"

namespace
{
  RHVoice_tts_engine g_engine = nullptr;
  std::vector<std::string> g_resource_paths;
  std::vector<const char*> g_resource_path_ptrs;
  std::vector<short> g_pcm;
  std::string g_last_error;
  std::string g_last_json;
  int g_sample_rate = 0;

  void set_error(const std::string& message)
  {
    g_last_error = message;
  }

  void clear_error()
  {
    g_last_error.clear();
  }

  std::string trim(const std::string& value)
  {
    const auto begin = value.find_first_not_of(" \t\r\n");
    if(begin == std::string::npos)
      {
        return "";
      }
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
  }

  std::string escape_json(const std::string& value)
  {
    std::string out;
    out.reserve(value.size() + 8);
    for(const char ch: value)
      {
        switch(ch)
          {
          case '\\':
            out += "\\\\";
            break;
          case '"':
            out += "\\\"";
            break;
          case '\b':
            out += "\\b";
            break;
          case '\f':
            out += "\\f";
            break;
          case '\n':
            out += "\\n";
            break;
          case '\r':
            out += "\\r";
            break;
          case '\t':
            out += "\\t";
            break;
          default:
            out += ch;
            break;
          }
      }
    return out;
  }

  std::vector<std::string> parse_resource_paths(const char* serialized_paths)
  {
    std::vector<std::string> result;
    if(serialized_paths == nullptr)
      {
        return result;
      }

    std::stringstream stream(serialized_paths);
    std::string line;
    while(std::getline(stream, line))
      {
        line = trim(line);
        if(!line.empty())
          {
            result.push_back(line);
          }
      }
    return result;
  }

  int set_sample_rate_callback(int sample_rate, void*)
  {
    g_sample_rate = sample_rate;
    return 1;
  }

  int play_speech_callback(const short* samples, unsigned int count, void*)
  {
    if(samples == nullptr || count == 0)
      {
        return 1;
      }
    g_pcm.insert(g_pcm.end(), samples, samples + count);
    return 1;
  }
}

extern "C"
{
  EMSCRIPTEN_KEEPALIVE int rhvoice_web_init(const char* serialized_paths)
  {
    clear_error();

    if(g_engine != nullptr)
      {
        RHVoice_delete_tts_engine(g_engine);
        g_engine = nullptr;
      }

    g_pcm.clear();
    g_sample_rate = 0;
    g_resource_paths = parse_resource_paths(serialized_paths);

    if(g_resource_paths.empty())
      {
        set_error("No resource paths were provided.");
        return 0;
      }

    g_resource_path_ptrs.clear();
    g_resource_path_ptrs.reserve(g_resource_paths.size() + 1);
    for(const auto& path: g_resource_paths)
      {
        g_resource_path_ptrs.push_back(path.c_str());
      }
    g_resource_path_ptrs.push_back(nullptr);

    RHVoice_callbacks callbacks {};
    callbacks.set_sample_rate = set_sample_rate_callback;
    callbacks.play_speech = play_speech_callback;

    RHVoice_init_params init_params {};
    init_params.data_path = nullptr;
    init_params.config_path = nullptr;
    init_params.resource_paths = g_resource_path_ptrs.data();
    init_params.callbacks = callbacks;
    init_params.options = 0;

    g_engine = RHVoice_new_tts_engine(&init_params);
    if(g_engine == nullptr)
      {
        set_error("RHVoice engine initialization failed.");
        return 0;
      }

    return 1;
  }

  EMSCRIPTEN_KEEPALIVE void rhvoice_web_shutdown()
  {
    clear_error();
    g_pcm.clear();
    g_sample_rate = 0;
    if(g_engine != nullptr)
      {
        RHVoice_delete_tts_engine(g_engine);
        g_engine = nullptr;
      }
  }

  EMSCRIPTEN_KEEPALIVE const char* rhvoice_web_get_last_error()
  {
    return g_last_error.c_str();
  }

  EMSCRIPTEN_KEEPALIVE const char* rhvoice_web_list_voices_json()
  {
    clear_error();

    if(g_engine == nullptr)
      {
        set_error("RHVoice engine is not initialized.");
        return nullptr;
      }

    const auto count = RHVoice_get_number_of_voices(g_engine);
    const auto* voices = RHVoice_get_voices(g_engine);

    std::ostringstream json;
    json << "[";
    for(unsigned int index = 0; index < count; ++index)
      {
        if(index > 0)
          {
            json << ",";
          }
        const auto& voice = voices[index];
        json << "{";
        json << "\"name\":\"" << escape_json(voice.name ? voice.name : "") << "\",";
        json << "\"language\":\"" << escape_json(voice.language ? voice.language : "") << "\",";
        json << "\"country\":\"" << escape_json(voice.country ? voice.country : "") << "\",";
        json << "\"gender\":" << static_cast<int>(voice.gender);
        json << "}";
      }
    json << "]";

    g_last_json = json.str();
    return g_last_json.c_str();
  }

  EMSCRIPTEN_KEEPALIVE int rhvoice_web_speak_text(const char* text, const char* voice_name, double rate, double pitch, double volume, int message_type)
  {
    clear_error();

    if(g_engine == nullptr)
      {
        set_error("RHVoice engine is not initialized.");
        return 0;
      }
    if(text == nullptr || voice_name == nullptr)
      {
        set_error("Text and voice are required.");
        return 0;
      }

    g_pcm.clear();
    g_sample_rate = 0;

    RHVoice_synth_params synth_params {};
    synth_params.voice_profile = voice_name;
    synth_params.absolute_rate = rate;
    synth_params.absolute_pitch = pitch;
    synth_params.absolute_volume = volume;
    synth_params.relative_rate = 1.0;
    synth_params.relative_pitch = 1.0;
    synth_params.relative_volume = 1.0;
    synth_params.punctuation_mode = RHVoice_punctuation_default;
    synth_params.punctuation_list = nullptr;
    synth_params.capitals_mode = RHVoice_capitals_default;
    synth_params.flags = 0;

    const auto text_length = static_cast<unsigned int>(std::char_traits<char>::length(text));
    const auto rhvoice_message_type = static_cast<RHVoice_message_type>(message_type);
    RHVoice_message message = RHVoice_new_message(g_engine, text, text_length, rhvoice_message_type, &synth_params, nullptr);
    if(message == nullptr)
      {
        set_error("RHVoice failed to create a message.");
        return 0;
      }

    const int ok = RHVoice_speak(message);
    RHVoice_delete_message(message);
    if(ok == 0)
      {
        set_error("RHVoice synthesis failed.");
        return 0;
      }

    if(g_sample_rate == 0)
      {
        set_error("RHVoice did not emit a sample rate.");
        return 0;
      }

    return 1;
  }

  EMSCRIPTEN_KEEPALIVE const short* rhvoice_web_get_last_pcm_ptr()
  {
    return g_pcm.empty() ? nullptr : g_pcm.data();
  }

  EMSCRIPTEN_KEEPALIVE std::size_t rhvoice_web_get_last_pcm_size()
  {
    return g_pcm.size();
  }

  EMSCRIPTEN_KEEPALIVE int rhvoice_web_get_last_sample_rate()
  {
    return g_sample_rate;
  }
}
