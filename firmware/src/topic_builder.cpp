#include <Arduino.h>
#include "messages.h"
#include <cstdio>

char* buildNodeTopic(const char* nodeId, const char* suffix, char* buf, size_t bufLen) {
    snprintf(buf, bufLen, "xentient/node/%s%s", nodeId, suffix);
    return buf;
}