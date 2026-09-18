use framework "AppKit"
use framework "Foundation"
use scripting additions

property NSAlertFirstButtonReturn : 1000
property NSAlertSecondButtonReturn : 1001
property NSAlertThirdButtonReturn : 1002
property NSUTF8StringEncoding : 4
property NSWindowStyleMaskTitled : 1
property NSBackingStoreBuffered : 2
property controllerPrefix : "VEXLIFE_CONTROLLER_STATE\t"
property actionPrefix : "VEXLIFE_CONTROLLER_ACTIONS\t"
property resultPrefix : "VEXLIFE_CONTROLLER_RESULT\t"
property sourceRootInfoKey : "VexLifeSourceRoot"

on run
  set repoRoot to my resolveRepoRoot()
  if repoRoot is missing value then
    my showMessage("VexLife setup stopped", "The Mac setup window requires one exact source root.", "OK")
    error number 2
  end if

  set fileManager to current application's NSFileManager's defaultManager()
  set backendPath to repoRoot & "/install/vexlife-setup.sh"
  if ((fileManager's fileExistsAtPath:backendPath) as boolean) is false then
    my showMessage("VexLife setup stopped", "The accepted Mac setup backend is missing from this exact source.", "OK")
    error number 2
  end if

  set environment to current application's NSProcessInfo's processInfo()'s environment()
  set configuredHome to environment's objectForKey:"VEXLIFE_HOME"
  if configuredHome is missing value then
    set homePath to (current application's NSHomeDirectory() as text) & "/.vexlife"
  else
    set homePath to configuredHome as text
  end if
  set homePath to my chooseHome(homePath)
  if homePath is missing value then return

  repeat
    set inspected to my runBackend(repoRoot, homePath, "inspect", "no", "no")
    if (exitCode of inspected) is not 0 then
      my showBackendFailure(inspected)
      return
    end if
    set stateValue to my prefixedValue(stdoutText of inspected, controllerPrefix)
    set actionsValue to my prefixedValue(stdoutText of inspected, actionPrefix)
    if stateValue is missing value or actionsValue is missing value then
      my showMessage("VexLife setup stopped", "The accepted setup backend did not return both typed state and admitted actions.", "OK")
      return
    end if

    if stateValue is "NODE_REQUIRED_HOMEBREW_AVAILABLE" then
      if not my hasAction(actionsValue, "install-node") then
        my showMessage("VexLife setup held", "Node.js is needed, but the backend did not admit an installation action. Nothing was changed.", "OK")
        return
      end if
      set choice to my promptChoice("Node.js is needed", "VexLife needs Node.js 20 or newer. Homebrew is available, but nothing will be installed without your permission.", "Install Node.js", "Not now", missing value)
      if choice is not NSAlertFirstButtonReturn then return
      set nodeResult to my runBackend(repoRoot, homePath, "install-node", "yes", "no")
      if (exitCode of nodeResult) is not 0 then
        my showBackendFailure(nodeResult)
        return
      end if
      -- Re-inspect after the accepted backend proves Node is visible.

    else if stateValue is "NODE_REQUIRED_MANUAL_INSTALL" then
      my showMessage("Node.js is needed", "Install Node.js 20 or newer, then open VexLife setup again. No changes were made.", "OK")
      return

    else if stateValue is "ABSENT" then
      if not my hasAction(actionsValue, "first-setup") then
        my showMessage("VexLife setup held", "No Vex Home exists here, and the accepted backend did not admit first setup. Nothing was changed.", "OK")
        return
      end if
      set homeChoice to my promptChoice("Create a Vex Home?", "No VexLife Home was found at the selected location. Continue only if you want VexLife to establish a new local Home there.", "Continue", "Cancel", missing value)
      if homeChoice is not NSAlertFirstButtonReturn then return
      set runtimeChoice to my promptChoice("Prepare the local Vex runtime?", "This supported Mac can use the current release-qualified source-local profile. Continuing may acquire several GiB of verified model/runtime files and start a local-only model. VexLife, not this window, selects and verifies those exact artifacts.", "Download and continue", "Not now", missing value)
      if runtimeChoice is not NSAlertFirstButtonReturn then return
      set setupResult to my runBackend(repoRoot, homePath, "first-setup", "no", "yes")
      if (exitCode of setupResult) is not 0 then
        my showBackendFailure(setupResult)
      else
        my showMessage("VexLife is ready", "The accepted setup engine completed first setup and opened the local VexLife experience.", "Done")
      end if
      return

    else if stateValue is "EXISTING_HEALTHY" then
      set openAllowed to my hasAction(actionsValue, "open")
      set recoveryAllowed to my hasAnyRecoveryAction(actionsValue)
      if openAllowed and recoveryAllowed then
        set choice to my promptChoice("VexLife is ready", "This Home is healthy. You can open Vex now or choose a preservation-safe action admitted by the current lifecycle owner.", "Open Vex", "Recovery…", "Cancel")
        if choice is NSAlertFirstButtonReturn then
          set actionResult to my runBackend(repoRoot, homePath, "open", "no", "no")
          if (exitCode of actionResult) is not 0 then my showBackendFailure(actionResult)
          return
        else if choice is NSAlertSecondButtonReturn then
          my recoveryFlow(repoRoot, homePath, actionsValue, false)
          return
        else
          return
        end if
      else if openAllowed then
        set choice to my promptChoice("VexLife is ready", "The current lifecycle owner admits opening this healthy Home.", "Open Vex", "Cancel", missing value)
        if choice is NSAlertFirstButtonReturn then
          set actionResult to my runBackend(repoRoot, homePath, "open", "no", "no")
          if (exitCode of actionResult) is not 0 then my showBackendFailure(actionResult)
        end if
        return
      else if recoveryAllowed then
        my recoveryFlow(repoRoot, homePath, actionsValue, false)
        return
      else
        my showMessage("VexLife setup held", "This Home is recognized, but the lifecycle owner currently admits no windowed action. Nothing was changed.", "OK")
        return
      end if

    else if stateValue is "EXISTING_DEGRADED_REPAIRABLE" then
      if my hasAnyRecoveryAction(actionsValue) then
        my recoveryFlow(repoRoot, homePath, actionsValue, true)
      else
        my showMessage("VexLife recovery held", "This Home needs attention, but the lifecycle owner currently admits no preservation-safe recovery action. Nothing was changed.", "OK")
      end if
      return

    else if stateValue is "HELD_NONCANONICAL_HOME" then
      my showMessage("This folder is being preserved", "VexLife found files there but cannot safely identify them as a Vex Home. Nothing will be overwritten, repaired, or deleted. Choose another Home or inspect that folder first.", "OK")
      return

    else
      my showMessage("VexLife setup stopped", "The current Home state could not be classified safely. Nothing was changed.", "OK")
      return
    end if
  end repeat
end run

on resolveRepoRoot()
  set bundledRoot to current application's NSBundle's mainBundle()'s objectForInfoDictionaryKey:sourceRootInfoKey
  if bundledRoot is missing value then return missing value
  set boundRoot to bundledRoot as text
  if boundRoot is "" then return missing value
  return boundRoot
end resolveRepoRoot

on chooseHome(defaultHome)
  set alert to current application's NSAlert's alloc()'s init()
  alert's setMessageText:"Continue with Vex"
  alert's setInformativeText:"VexLife checks this Mac and the selected Home before offering only actions that are currently safe. The Terminal route remains available for advanced or recovery use."
  alert's addButtonWithTitle:"Continue"
  alert's addButtonWithTitle:"Cancel"
  set field to current application's NSTextField's alloc()'s initWithFrame:(current application's NSMakeRect(0, 0, 440, 26))
  field's setStringValue:defaultHome
  field's setPlaceholderString:"Vex Home"
  alert's setAccessoryView:field
  current application's NSApp's activateIgnoringOtherApps:true
  set response to alert's runModal()
  if response is not NSAlertFirstButtonReturn then return missing value
  set chosen to (field's stringValue() as text)
  if chosen is "" then return defaultHome
  return chosen
end chooseHome

on hasAction(actionsText, actionName)
  if actionsText is missing value or actionsText is "" then return false
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to ","
  set actionItems to text items of actionsText
  set AppleScript's text item delimiters to oldDelimiters
  repeat with oneAction in actionItems
    if (oneAction as text) is actionName then return true
  end repeat
  return false
end hasAction

on hasAnyRecoveryAction(actionsText)
  return (my hasAction(actionsText, "repair")) or (my hasAction(actionsText, "rebuild-preserve")) or (my hasAction(actionsText, "uninstall-preserve"))
end hasAnyRecoveryAction

on chooseRecoveryAction(messageText, detailText, actionsText)
  set alert to current application's NSAlert's alloc()'s init()
  alert's setMessageText:messageText
  alert's setInformativeText:detailText
  set actionKeys to {}
  if my hasAction(actionsText, "repair") then
    alert's addButtonWithTitle:"Repair"
    set end of actionKeys to "repair"
  end if
  if my hasAction(actionsText, "rebuild-preserve") then
    alert's addButtonWithTitle:"Rebuild preserve"
    set end of actionKeys to "rebuild-preserve"
  end if
  if my hasAction(actionsText, "uninstall-preserve") then
    alert's addButtonWithTitle:"Uninstall preserve"
    set end of actionKeys to "uninstall-preserve"
  end if
  if (count of actionKeys) is 0 then return missing value
  alert's addButtonWithTitle:"Cancel"
  current application's NSApp's activateIgnoringOtherApps:true
  set response to alert's runModal() as integer
  set actionIndex to response - NSAlertFirstButtonReturn + 1
  if actionIndex is greater than 0 and actionIndex is less than or equal to (count of actionKeys) then return item actionIndex of actionKeys
  return missing value
end chooseRecoveryAction

on recoveryFlow(repoRoot, homePath, actionsText, degraded)
  if degraded then
    set messageText to "VexLife needs recovery"
    set detailText to "This Home is recognized, but VexLife must use one action currently admitted by its lifecycle owner before it can start. Preservation boundaries remain in force."
  else
    set messageText to "Recovery options"
    set detailText to "Only actions currently admitted by the lifecycle owner are shown. Repair may verify or reacquire runtime files; rebuild-preserve rebuilds runtime/transient state; uninstall-preserve removes runtime state while preserving Home and preserved data."
  end if
  set actionName to my chooseRecoveryAction(messageText, detailText, actionsText)
  if actionName is missing value then return

  if actionName is "repair" then
    set consent to my promptChoice("Repair VexLife?", "Repair may verify or reacquire required runtime files. Continue?", "Repair", "Cancel", missing value)
    if consent is not NSAlertFirstButtonReturn then return
    set actionResult to my runBackend(repoRoot, homePath, "repair", "no", "yes")
  else if actionName is "rebuild-preserve" then
    set consent to my promptChoice("Rebuild while preserving Home?", "This rebuilds runtime/transient state and may reacquire runtime files. Home, Memory, conversations, and verified model cache stay preserved.", "Rebuild preserve", "Cancel", missing value)
    if consent is not NSAlertFirstButtonReturn then return
    set actionResult to my runBackend(repoRoot, homePath, "rebuild-preserve", "no", "yes")
  else if actionName is "uninstall-preserve" then
    set consent to my promptChoice("Uninstall while preserving Home?", "This stops owned VexLife processes and removes runtime/transient state while preserving Home, Memory, conversations, and verified model files.", "Uninstall preserve", "Cancel", missing value)
    if consent is not NSAlertFirstButtonReturn then return
    set actionResult to my runBackend(repoRoot, homePath, "uninstall-preserve", "no", "no")
  else
    my showMessage("VexLife recovery held", "The selected action was not admitted by the current controller response. Nothing was changed.", "OK")
    return
  end if

  if (exitCode of actionResult) is not 0 then
    my showBackendFailure(actionResult)
  else
    set resultValue to my prefixedValue(stdoutText of actionResult, resultPrefix)
    if resultValue is "UNINSTALL_PRESERVE_COMPLETE" then
      my showMessage("VexLife runtime removed", "Your Vex Home and preserved data remain in place.", "Done")
    else
      my showMessage("VexLife recovery complete", "The accepted recovery owner completed the requested preservation-safe action.", "Done")
    end if
  end if
end recoveryFlow

on progressText(actionName)
  if actionName is "install-node" then return "Installing the prerequisite you approved. Keep this window open."
  if actionName is "first-setup" then return "Preparing VexLife. Verified model/runtime acquisition can take several minutes; this window will remain responsive."
  if actionName is "repair" then return "Repairing VexLife under the accepted preservation boundary. Keep this window open."
  if actionName is "rebuild-preserve" then return "Rebuilding runtime state while preserving Home and durable data. Keep this window open."
  if actionName is "uninstall-preserve" then return "Removing runtime state while preserving Home and durable data. Keep this window open."
  return "Opening VexLife. Keep this window open."
end progressText

on beginProgress(actionName)
  set panel to current application's NSPanel's alloc()'s initWithContentRect:(current application's NSMakeRect(0, 0, 460, 118)) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:false
  panel's setTitle:"VexLife setup"
  set label to current application's NSTextField's labelWithString:(my progressText(actionName))
  label's setFrame:(current application's NSMakeRect(24, 58, 412, 36))
  set indicator to current application's NSProgressIndicator's alloc()'s initWithFrame:(current application's NSMakeRect(24, 25, 412, 18))
  indicator's setIndeterminate:true
  indicator's startAnimation:(missing value)
  panel's contentView()'s addSubview:label
  panel's contentView()'s addSubview:indicator
  panel's |center|()
  panel's makeKeyAndOrderFront:(missing value)
  current application's NSApp's activateIgnoringOtherApps:true
  return panel
end beginProgress

on runBackend(repoRoot, homePath, actionName, nodeConsent, runtimeConsent)
  set fileManager to current application's NSFileManager's defaultManager()
  set token to current application's NSUUID's UUID()'s UUIDString() as text
  set tempRoot to current application's NSTemporaryDirectory() as text
  set outPath to tempRoot & "vexlife-setup-" & token & ".out"
  set errPath to tempRoot & "vexlife-setup-" & token & ".err"
  fileManager's createFileAtPath:outPath |contents|:(missing value) attributes:(missing value)
  fileManager's createFileAtPath:errPath |contents|:(missing value) attributes:(missing value)
  set outHandle to current application's NSFileHandle's fileHandleForWritingAtPath:outPath
  set errHandle to current application's NSFileHandle's fileHandleForWritingAtPath:errPath

  set task to current application's NSTask's alloc()'s init()
  task's setLaunchPath:"/bin/bash"
  task's setArguments:{repoRoot & "/install/vexlife-setup.sh", repoRoot, "--controller", "--home", homePath, "--action", actionName, "--node-install-consent", nodeConsent, "--runtime-acquisition-consent", runtimeConsent}
  task's setStandardOutput:outHandle
  task's setStandardError:errHandle
  set launchErrorText to ""
  set progressPanel to missing value
  if actionName is not "inspect" then set progressPanel to my beginProgress(actionName)
  try
    task's |launch|()
    if progressPanel is missing value then
      task's waitUntilExit()
    else
      repeat while (task's isRunning() as boolean)
        current application's NSRunLoop's currentRunLoop()'s runUntilDate:(current application's NSDate's dateWithTimeIntervalSinceNow:0.1)
      end repeat
    end if
    set taskStatus to task's terminationStatus() as integer
  on error launchError
    set taskStatus to 127
    set launchErrorText to launchError as text
  end try
  if progressPanel is not missing value then progressPanel's orderOut:(missing value)
  try
    outHandle's closeFile()
    errHandle's closeFile()
  end try

  set outData to current application's NSData's dataWithContentsOfFile:outPath
  set errData to current application's NSData's dataWithContentsOfFile:errPath
  set outText to current application's NSString's alloc()'s initWithData:outData encoding:NSUTF8StringEncoding
  set errTextValue to current application's NSString's alloc()'s initWithData:errData encoding:NSUTF8StringEncoding
  set stderrValue to errTextValue as text
  if stderrValue is "" and launchErrorText is not "" then set stderrValue to launchErrorText
  try
    fileManager's removeItemAtPath:outPath |error|:(missing value)
    fileManager's removeItemAtPath:errPath |error|:(missing value)
  end try
  return {exitCode:taskStatus, stdoutText:(outText as text), stderrText:stderrValue}
end runBackend

on prefixedValue(sourceText, prefixText)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to linefeed
  set sourceLines to text items of sourceText
  set AppleScript's text item delimiters to oldDelimiters
  repeat with oneLine in sourceLines
    set lineText to oneLine as text
    if lineText starts with prefixText then
      return text ((length of prefixText) + 1) thru -1 of lineText
    end if
  end repeat
  return missing value
end prefixedValue

on promptChoice(titleText, detailText, firstTitle, secondTitle, thirdTitle)
  set alert to current application's NSAlert's alloc()'s init()
  alert's setMessageText:titleText
  alert's setInformativeText:detailText
  alert's addButtonWithTitle:firstTitle
  alert's addButtonWithTitle:secondTitle
  if thirdTitle is not missing value then alert's addButtonWithTitle:thirdTitle
  current application's NSApp's activateIgnoringOtherApps:true
  return alert's runModal()
end promptChoice

on showMessage(titleText, detailText, buttonTitle)
  set alert to current application's NSAlert's alloc()'s init()
  alert's setMessageText:titleText
  alert's setInformativeText:detailText
  alert's addButtonWithTitle:buttonTitle
  current application's NSApp's activateIgnoringOtherApps:true
  alert's runModal()
end showMessage

on showBackendFailure(resultRecord)
  set detailText to stderrText of resultRecord
  if detailText is "" then set detailText to stdoutText of resultRecord
  if detailText is "" then set detailText to "The accepted setup backend stopped without a readable detail."
  my showMessage("VexLife stopped safely", detailText, "OK")
end showBackendFailure

-- This source-local AppKit projection is not a signed/public build and does not
-- own model/runtime identity, Home semantics, lifecycle classification, or CDR.
-- [VXG RealForever]
