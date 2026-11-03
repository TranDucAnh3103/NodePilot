import { User } from '../types'

/**
 * Checks if the user has superuser/root authority
 */
export function isUserRoot(user: User | null | undefined): boolean {
  if (!user) return false
  return (
    user.role === 'root' ||
    user.role === 'admin' ||
    user.username === 'stephen3103' ||
    user.username === 'tranducanh31032006@gmail.com' ||
    user.username === 'piganh408@gmail.com'
  )
}

/**
 * Checks if the user is authorized to perform edit/mutation actions in a given tab.
 * - Root / Admin always have full authority.
 * - Viewers / other roles MUST have the tab explicitly declared in permissions.editTabs.
 */
export function canUserEditTab(user: User | null | undefined, tabName: string): boolean {
  if (!user) return false
  if (isUserRoot(user)) return true
  const editTabs = user.permissions?.editTabs || []
  return editTabs.includes(tabName)
}

/**
 * Checks if the user is authorized to view a given tab.
 */
export function canUserViewTab(user: User | null | undefined, tabName: string): boolean {
  if (!user) return false
  if (isUserRoot(user)) return true
  const viewTabs = user.permissions?.viewTabs
  if (!viewTabs || viewTabs.length === 0) {
    // Default safe view tabs for viewers
    const defaultViewerTabs = ['overview', 'docker', 'services', 'processes', 'tasks', 'files', 'audit']
    return defaultViewerTabs.includes(tabName)
  }
  return viewTabs.includes(tabName)
}
