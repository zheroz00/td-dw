package io.github.zheroz00.tddw;

import android.service.notification.NotificationListenerService;

/**
 * Does nothing itself. Android only lets an app read other apps' media sessions once it has an enabled
 * notification listener, so this service exists to be granted that access (see the README).
 */
public final class MediaListener extends NotificationListenerService {}
