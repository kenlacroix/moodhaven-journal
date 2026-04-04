package com.moodbloom.app

/**
 * WearProtocol — canonical path constants for the Wear OS Data Layer wire protocol.
 *
 * All message paths, channel paths, and directory names used by WearListenerService,
 * WearPlugin, and AudioFrameParser are defined here. Any change to the wire protocol
 * must be reflected on both sides (phone + watch) simultaneously.
 */
object WearProtocol {
    /** MessageAPI path for mood-tap signal envelopes from the watch. */
    const val PATH_SIGNAL = "/signal"

    /** MessageAPI path for legacy voice-memo metadata (no longer sent by watch; kept for compat). */
    const val PATH_VOICE_MEMO_META = "/voice_memo"

    /** ChannelAPI path for audio stream transfers from the watch. */
    const val CHANNEL_AUDIO = "/audio_channel"

    /** MessageAPI path for haptic feedback sent from phone → watch. */
    const val PATH_FEEDBACK = "/feedback"

    /** Subdirectory under filesDir where incoming audio files are staged. */
    const val INCOMING_DIR = "voice_memos_incoming"

    /** Maximum byte size of the metadata JSON header (1 MB guard against malformed frames). */
    const val MAX_METADATA_BYTES = 1_048_576
}
