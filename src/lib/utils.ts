/**
 * Utility Functions
 */

import { clsx, type ClassValue } from "clsx";

/**
 * Merge class names with clsx
 * Usage: cn("base-class", condition && "conditional-class", "another-class")
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}





