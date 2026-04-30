#include <Arduino.h>
#include "messages.h"
#include <cstdio>

char* buildNodeTopic(const char* nodeId, const char* suffix, char* buf, size_t bufLen) {
    if (!nodeId || !suffix || !buf || bufLen == 0) {
        if (buf && bufLen > 0) buf[0] = '\0';
        return buf;
    }
    int written = snprintf(buf, bufLen, "%s%s%s", TOPIC_NODE_BASE, nodeId, suffix);
    if (written < 0 || static_cast<size_t>(written) >= bufLen) {
        Serial.printf("[MQTT] buildNodeTopic truncated: need %d, have %u\n",
                      written + 1, (unsigned)bufLen);
        buf[0] = '\0';
    }
    return buf;
}