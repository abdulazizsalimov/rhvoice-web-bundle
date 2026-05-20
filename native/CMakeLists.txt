cmake_minimum_required(VERSION 3.20)
project(rhvoice_web_native LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "This project must be configured with emcmake/emcc.")
endif()

if(NOT DEFINED RHVOICE_SRC)
  message(FATAL_ERROR "Pass -DRHVOICE_SRC=/path/to/RHVoice")
endif()

if(NOT DEFINED NATIVE_OUT_DIR)
  message(FATAL_ERROR "Pass -DNATIVE_OUT_DIR=/path/to/output")
endif()

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(ENABLE_SONIC 0)
set(ENABLE_PKG 0)
set(VERSION "1.18.4-webmvp")
set(DATA_PATH "")
set(CONFIG_PATH "/rhvoice/config")

configure_file("${RHVOICE_SRC}/src/include/core/config.h.in" "${RHVOICE_SRC}/src/include/core/config.h" @ONLY)
configure_file("${RHVOICE_SRC}/src/core/config.h.in" "${RHVOICE_SRC}/src/core/config.h" @ONLY)

file(GLOB RHVOICE_CORE_SOURCES CONFIGURE_DEPENDS
  "${RHVOICE_SRC}/src/core/*.cpp"
  "${RHVOICE_SRC}/src/core/*.c"
)
file(GLOB RHVOICE_HTS_SOURCES CONFIGURE_DEPENDS "${RHVOICE_SRC}/src/hts_engine/HTS_*.c")
file(GLOB BOOST_INCLUDE_DIRS CONFIGURE_DEPENDS "${RHVOICE_SRC}/external/libs/boost/libs/*/include")

list(REMOVE_ITEM RHVOICE_CORE_SOURCES
  "${RHVOICE_SRC}/src/core/emoji_data.cpp"
  "${RHVOICE_SRC}/src/core/unidata.cpp"
  "${RHVOICE_SRC}/src/core/userdict_parser.c"
  "${RHVOICE_SRC}/src/core/mage_hts_engine_impl.cpp"
)
list(REMOVE_ITEM RHVOICE_HTS_SOURCES
  "${RHVOICE_SRC}/src/hts_engine/HTS_audio.c"
)

add_executable(rhvoice_core
  ${RHVOICE_CORE_SOURCES}
  ${RHVOICE_HTS_SOURCES}
  "${RHVOICE_SRC}/src/lib/lib.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/src/rhvoice_web.cpp"
)

target_include_directories(rhvoice_core PRIVATE
  "${RHVOICE_SRC}/src/include"
  "${RHVOICE_SRC}/src/hts_engine"
  "${RHVOICE_SRC}/src/third-party/utf8"
  "${RHVOICE_SRC}/src/third-party/rapidxml"
  ${BOOST_INCLUDE_DIRS}
)

target_link_libraries(rhvoice_core PRIVATE m)
target_compile_options(rhvoice_core PRIVATE
  "-fexceptions"
  "-fwasm-exceptions"
)

set_target_properties(rhvoice_core PROPERTIES
  OUTPUT_NAME "rhvoice_core"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${NATIVE_OUT_DIR}"
)

set(EXPORTED_FUNCTIONS "['_malloc','_free','_rhvoice_web_init','_rhvoice_web_shutdown','_rhvoice_web_list_voices_json','_rhvoice_web_get_last_error','_rhvoice_web_speak_text','_rhvoice_web_get_last_pcm_ptr','_rhvoice_web_get_last_pcm_size','_rhvoice_web_get_last_sample_rate']")
set(EXPORTED_RUNTIME_METHODS "['FS','UTF8ToString','ccall','HEAP16']")

target_link_options(rhvoice_core PRIVATE
  "-O3"
  "-sSTACK_SIZE=2097152"
  "-fwasm-exceptions"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sFORCE_FILESYSTEM=1"
  "-lidbfs.js"
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sENVIRONMENT=web,worker,node"
  "-sEXPORT_NAME=createRhvoiceModule"
  "-sEXPORTED_FUNCTIONS=${EXPORTED_FUNCTIONS}"
  "-sEXPORTED_RUNTIME_METHODS=${EXPORTED_RUNTIME_METHODS}"
  "--no-entry"
)
